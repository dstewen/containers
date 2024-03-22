FROM ghcr.io/dstewen/alpine:3.19.1@sha256:7ed345a573d7b0150007b1fbaed93af80d3fba6f2c674fd4e3187491e6b3c81d

ARG TARGETPLATFORM
ARG VERSION
ARG CHANNEL

#hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates postgresql16-client~"${VERSION}"

USER kah

COPY ./apps/postgres-init/entrypoint.sh /entrypoint.sh

CMD ["/entrypoint.sh"]

LABEL org.opencontainers.image.source="https://github.com/postgres/postgres"
