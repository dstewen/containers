FROM docker.io/library/alpine:3.24.3 AS builder
ARG VERSION

WORKDIR /build

# hadolint ignore=DL4006,DL3018
RUN \
  apk add --no-cache \
    gcc \
    git \
    musl-dev \
    linux-headers \
  && git clone https://github.com/udp-redux/udp-broadcast-relay-redux.git /tmp/udp-src \
  && if [ -n "$VERSION" ]; then \
    NUMBER_COMMITS_TO_REVERT=$(( $(git rev-list --count --first-parent HEAD) - $(echo "${VERSION}" | cut -d "." -f3) )); \
    git checkout "master~$NUMBER_COMMITS_TO_REVERT"; \
  fi \
  && cp -r /tmp/udp-src/* /tmp/udp-src/.* /build/ 2>/dev/null \
  && rm -rf /tmp/udp-src \
  && gcc -g main.c -o udp-broadcast-relay-redux

FROM docker.io/library/alpine:3.24.3
WORKDIR /app
RUN \
  apk add --no-cache \
    bash
COPY --from=builder /build/udp-broadcast-relay-redux .
COPY ./entrypoint.sh /entrypoint.sh
CMD ["/entrypoint.sh"]
