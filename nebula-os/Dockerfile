FROM rust:1.88-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml .
COPY Cargo.lock .
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/nebula-os /usr/local/bin/nebula-os
RUN mkdir -p /data/blobs /data/meta
EXPOSE 9000
CMD ["nebula-os"]
