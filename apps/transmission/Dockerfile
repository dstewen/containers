FROM ghcr.io/dstewen/alpine:3.19.1@sha256:7ed345a573d7b0150007b1fbaed93af80d3fba6f2c674fd4e3187491e6b3c81d

ARG TARGETPLATFORM
ARG VERSION
ARG CHANNEL

ENV HOME=/config \
    XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/config \
    TRANSMISSION__RPC_PORT=9091 \
    TRANSMISSION_WEB_HOME=/app/web

#hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates findutils geoip p7zip python3 \
    transmission-cli~"${VERSION}" \
    transmission-daemon~"${VERSION}" \
    transmission-remote~"${VERSION}"

#hadolint ignore=DL3059
RUN chown -R root:root /usr/bin/transmission* \
    && chmod -R 755 /usr/bin/transmission* \
    && ln -s /usr/bin/transmission-cli /app/transmission-cli \
    && ln -s /usr/bin/transmission-daemon /app/transmission-daemon \
    && ln -s /usr/bin/transmission-remote /app/transmission-remote \
    && ln -s /usr/share/transmission/public_html /app/web \
    && rm -rf /tmp/*

USER kah
COPY ./apps/transmission/settings.json.tmpl /app/settings.json.tmpl
COPY ./apps/transmission/entrypoint.sh /entrypoint.sh
CMD ["/entrypoint.sh"]

LABEL org.opencontainers.image.source="https://github.com/transmission/transmission"
