FROM docker.io/library/golang:1.24-alpine as envsubst
ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT=""
ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH} \
    GOARM=${TARGETVARIANT}
RUN go install -ldflags="-s -w" github.com/drone/envsubst/cmd/envsubst@latest && \
    cp /go/bin/envsubst /usr/local/bin/envsubst

FROM docker.io/library/alpine:3.24.3

ARG TARGETPLATFORM
ARG VERSION
ARG CHANNEL

ENV \
    READARR__INSTANCE_NAME="Readarr" \
    READARR__BRANCH="${CHANNEL}" \
    READARR__PORT="8787" \
    READARR__ANALYTICS_ENABLED="False"

#hadolint ignore=DL3018
RUN apk add --no-cache \
        bash \
        ca-certificates \
        catatonit \
        curl \
        icu-libs \
        libintl \
        sqlite-libs \
        xmlstarlet
#hadolint ignore=DL3059
RUN \
    case "${TARGETPLATFORM}" in \
        'linux/amd64') export ARCH='x64' ;; \
        'linux/arm64') export ARCH='arm64' ;; \
    esac \
    && \
    mkdir -p /app/bin \
    && \
    curl -fsSL "https://readarr.servarr.com/v1/update/${READARR__BRANCH}/updatefile?version=${VERSION}&os=linuxmusl&runtime=netcore&arch=${ARCH}" \
        | tar xzf - -C /app/bin --strip-components=1 \
    && \
    rm -rf \
        /app/bin/Readarr.Update \
    && \
    printf "UpdateMethod=docker\nBranch=%s\nPackageVersion=%s\nPackageAuthor=[dstewen](https://github.com/dstewen)\n" "${READARR__BRANCH}" "${VERSION}" > /app/package_info \
    && chown -R root:root /app \
    && chmod -R 755 /app \
    && rm -rf /tmp/*

RUN adduser -D kah \
    && addgroup kah disk \
    && addgroup kah video \
    && addgroup kah audio \
    && mkdir -p /config \
    && chown -R kah:kah /config

COPY ./config.xml.tmpl /app/config.xml.tmpl
COPY ./entrypoint.sh /entrypoint.sh
COPY --from=envsubst /usr/local/bin/envsubst /usr/local/bin/envsubst

ENTRYPOINT ["/usr/bin/catatonit", "--"]
CMD ["/entrypoint.sh"]

LABEL org.opencontainers.image.source="https://github.com/Readarr/Readarr"
