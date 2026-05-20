# Human: Aurora builds Nebular OS from GitHub because Compose on Windows cannot use a remote Git build context.
# Agent: ARG NEBULAR_OS_REF from nebular-os.ref; CLONE AsP3X/nebular-os; CHECKOUT pin; cargo build --release nebular-os binary.

FROM rust:1.88-slim-bookworm AS builder
ARG NEBULAR_OS_REF=1a16b801cc1469c4fba0d9223c07b4b1e1c36e2e
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init nebular-os \
    && cd nebular-os \
    && git remote add origin https://github.com/AsP3X/nebular-os.git \
    && git fetch --depth 1 origin "${NEBULAR_OS_REF}" \
    && git checkout FETCH_HEAD
WORKDIR /src/nebular-os
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /src/nebular-os/target/release/nebular-os /usr/local/bin/nebular-os
RUN printf '#!/bin/sh\nmkdir -p /data/blobs /data/meta\nexec nebular-os "$@"\n' > /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 9000
ENTRYPOINT ["/entrypoint.sh"]
