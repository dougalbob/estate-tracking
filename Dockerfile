# Build the application and the native better-sqlite3 dependency with the
# toolchain available. The runtime image only receives the pruned production
# dependencies and does not contain compilers or development tooling.
FROM node:22-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# bookworm-slim already supplies Node's runtime libraries; libstdc++ is kept
# explicit because better-sqlite3 is a native module.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.cjs ./scripts/migrate.cjs
COPY docker-entrypoint.sh /usr/local/bin/estate-organiser-entrypoint

RUN chmod 0755 /usr/local/bin/estate-organiser-entrypoint \
  && mkdir -p /data

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/estate-organiser-entrypoint"]
