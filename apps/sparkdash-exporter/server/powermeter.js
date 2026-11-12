/**
 * PowerMeterTracker — reads wall power from Home Assistant.
 *
 * Supports the same config format as sparkDash (config/power-meters.json):
 *   { "meters": { "ha": { "type": "homeassistant", "url": "..." } },
 *     "units": { "spark-a": { "meter": "ha", "channel": "sensor.xxx_power" } } }
 *
 * Only reads current power values (no history) — that belongs on sparkDash.
 * Polls at configurable interval; exposes readings via getMetersForPrometheus().
 *
 * Token: SPARKDASH_HA_TOKEN env var, never read from config file.
 */

export class PowerMeterTracker {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
    this.pollIntervalMs = 10000;
    this.staleAfterMs = 30000;
    this._timer = null;
    this._readingCache = new Map(); // channel -> { watts, atMs, up }
    this._meterStates = new Map(); // meter id -> { type, healthy }
    this._unitChannels = new Map(); // unit id -> { meter, channel, since }

    this._loadConfig();
  }

  async _loadConfig() {
    try {
      const fs = await import("fs");
      const config = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));

      if (!config.units || typeof config.units !== "object") {
        console.warn("[exporter] Power meter config missing 'units' field");
        return;
      }

      this.config = config;
      this.pollIntervalMs = Number(config.pollIntervalMs) || 10000;
      this.staleAfterMs = Number(config.staleAfterMs) || 30000;

      if (config.enabled === false) {
        console.log("[exporter] Power meters explicitly disabled");
        return;
      }

      // Validate: config must not contain tokens (tokens from env only)
      for (const meter of Object.values(config.meters || {})) {
        if (meter.token || meter.api_key) {
          console.warn(`[exporter] Meter ${meter.type} must not hold a token in config; set SPARKDASH_${meter.type.toUpperCase()}_TOKEN`);
          this.config = null;
          return;
        }
      }

      for (const [id, meter] of Object.entries(config.meters || {})) {
        this._meterStates.set(id, { type: meter.type, healthy: true });
      }

      for (const [unitId, unitConfig] of Object.entries(config.units)) {
        this._unitChannels.set(unitId, {
          meter: unitConfig.meter,
          channel: unitConfig.channel,
          since: unitConfig.since ? new Date(unitConfig.since).getTime() : null,
        });
      }

      console.log(`[exporter] Power meters loaded: ${this._unitChannels.size} units, ${this._meterStates.size} meters`);
    } catch (err) {
      console.error(`[exporter] Failed to load power meter config: ${err.message}`);
    }
  }

  start() {
    if (this._timer || !this.config) return;
    this._poll();
    this._timer = setInterval(() => this._poll(), this.pollIntervalMs);
    this._timer.unref();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _poll() {
    if (!this.config) return;

    const meters = this.config.meters || {};
    const unitChannels = this.config.units || {};

    // Group channels by meter for batch requests
    const meterChannels = new Map();
    for (const [unitId, uc] of unitChannels) {
      if (uc.since && Date.now() < uc.since) continue;
      meterChannels.set(uc.meter, [...(meterChannels.get(uc.meter) || []), uc.channel]);
    }

    for (const [meterId, channels] of meterChannels) {
      const meter = meters[meterId];
      if (!meter || meter.type !== "homeassistant") continue;

      try {
        const token = process.env.SPARKDASH_HA_TOKEN;
        if (!token) {
          console.error("[exporter] Missing SPARKDASH_HA_TOKEN for meter " + meterId);
          this._meterStates.set(meterId, { type: meter.type, healthy: false });
          this._clearChannels(channels, meterId);
          continue;
        }

        // Batch fetch all states in one request
        const resp = await fetch(new URL("/api/states", meter.url), {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (!Array.isArray(data)) { this._clearChannels(channels, meterId); continue; }

        const byEntityId = new Map(data.map(s => [s.entity_id, s]));

        for (const channel of channels) {
          const stateObj = byEntityId.get(channel);
          if (!stateObj) {
            this._readingCache.set(channel, { watts: null, atMs: 0, up: false });
            continue;
          }

          const lastReported = stateObj.last_reported
            ? new Date(stateObj.last_reported).getTime()
            : stateObj.last_updated
              ? new Date(stateObj.last_updated).getTime()
              : 0;
          const stale = Date.now() - lastReported > this.staleAfterMs;

          let watts = null;
          const numVal = parseFloat(stateObj.state);
          if (Number.isFinite(numVal) && numVal >= 0
              && !stale && stateObj.state !== "unavailable" && stateObj.state !== "unknown") {
            const unit = (stateObj.attributes?.unit_of_measurement || "W").toUpperCase();
            if (unit === "KW") watts = numVal * 1000;
            else if (unit === "MW") watts = numVal * 1000000;
            else watts = numVal;
          }

          this._readingCache.set(channel, { watts, atMs: lastReported, up: watts !== null });
        }

        this._meterStates.set(meterId, { type: meter.type, healthy: true });
      } catch (err) {
        console.error(`[exporter] Power meter ${meterId} failed:`, err.message);
        this._meterStates.set(meterId, { type: meter.type, healthy: false });
        this._clearChannels(channels, meterId);
      }
    }
  }

  _clearChannels(channels, meterId) {
    for (const ch of channels) {
      this._readingCache.set(ch, { watts: null, atMs: 0, up: false });
    }
  }

  /** Return power meter data formatted for Prometheus rendering. */
  getMetersForPrometheus() {
    const result = [];
    const unitToChannel = new Map();
    for (const [unitId, uc] of this._unitChannels) {
      if (uc.since && Date.now() < uc.since) continue;
      unitToChannel.set(unitId, uc.channel);
    }

    for (const [channel, reading] of this._readingCache) {
      const meterLabel = [...this._unitChannels.entries()]
        .find(([, uc]) => uc.channel === channel)?.[0] || "unknown";
      const unitId = [...unitToChannel.entries()].find(([, ch]) => ch === channel)?.[0] || null;

      result.push({
        name: meterLabel,
        channel,
        unit: unitId,
        watts: reading.watts,
        up: reading.up,
        atMs: reading.atMs,
      });
    }

    return result;
  }
}
