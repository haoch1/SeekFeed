# syntax=docker/dockerfile:1.7

# Build stage runs natively on the host ($BUILDPLATFORM) to avoid QEMU emulation
# overhead for multi-arch builds; the emitted JS bundle is architecture-independent.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.3-slim AS build
WORKDIR /usr/src/app

COPY package.json bun.lock ./
RUN --mount=type=cache,id=seekfeed-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
RUN bun run build \
    && mkdir -p /usr/src/app/data /usr/src/app/logs

# Release stage contains zero RUN instructions so linux/amd64 and linux/arm64
# images assemble natively without QEMU emulation.
FROM oven/bun:1.4.3-slim AS release
WORKDIR /usr/src/app

LABEL org.opencontainers.image.title="SeekFeed"
LABEL org.opencontainers.image.description="Self-hosted NodeSeek RSS monitor, keyword subscription, Telegram notifier, and community analytics"
LABEL org.opencontainers.image.source="https://github.com/haoch1/SeekFeed"

COPY --from=build --chown=bun:bun /usr/src/app/data ./data
COPY --from=build --chown=bun:bun /usr/src/app/logs ./logs
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/src/database/migrations ./src/database/migrations
COPY package.json LICENSE ./
COPY licenses/ ./licenses/

ENV NODE_ENV=production \
    PORT=3010 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/usr/src/app/data/seekfeed.db

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["bun", "--no-install", "dist/healthcheck.js"]

USER bun
ENTRYPOINT ["bun", "--no-install", "dist/seekfeed.js"]
