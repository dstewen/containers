FROM ghcr.io/dstewen/alpine:3.19.1@sha256:7f484b79c9a121c23b2ee3ae1304ae4f00b586624efd08cfefc10b5c43fcc9fd

ARG TARGETPLATFORM
ARG VERSION
ARG CHANNEL

#hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates postgresql16-client~"${VERSION}"

USER kah

COPY ./apps/postgres-init/entrypoint.sh /entrypoint.sh

CMD ["/entrypoint.sh"]

LABEL org.opencontainers.image.source="https://github.com/postgres/postgres"
