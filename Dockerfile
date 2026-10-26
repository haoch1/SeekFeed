# Keep the builder and runtime aligned with CI; dependencies stay in the builder.
FROM oven/bun:1.4.3-slim AS build
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
RUN bun run build

FROM oven/bun:1.4.3-slim AS release
WORKDIR /usr/src/app
LABEL org.opencontainers.image.title="SeekFeed"
LABEL org.opencontainers.image.description="NodeSeek RSS monitoring and Telegram notifications"

# 创建目录
RUN mkdir -p /usr/src/app/data /usr/src/app/logs \
    && chown -R bun:bun /usr/src/app/data /usr/src/app/logs

# 复制应用文件
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/src/database/migrations ./src/database/migrations
COPY package.json .
COPY licenses/ ./licenses/
COPY LICENSE ./LICENSE

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3010
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/usr/src/app/data/seekfeed.db

# 暴露端口
EXPOSE 3010

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["bun", "--no-install", "dist/healthcheck.js"]

# 启动应用
USER bun
ENTRYPOINT ["bun", "--no-install", "dist/seekfeed.js"]
