# The TaskFlow API image. Build from the repository root (it needs the workspace):
#   docker build -f apps/api/Dockerfile -t taskflow-api .
# One image serves both the API and the migration step:
#   default command → the API;  `pnpm exec prisma migrate deploy` → migrations.
FROM node:22-slim
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Dependencies first, so this layer is cached until a manifest or the lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY packages/api-contract/package.json packages/api-contract/
RUN pnpm install --frozen-lockfile --filter @taskflow/api...

# Then the sources, and the build (prisma generate + tsc).
COPY packages/api-contract packages/api-contract
COPY apps/api apps/api
RUN pnpm --filter @taskflow/api build

WORKDIR /repo/apps/api
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
