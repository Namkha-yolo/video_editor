FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN pnpm install --frozen-lockfile --filter @clipvibe/server... || \
    pnpm install --no-frozen-lockfile --filter @clipvibe/server...

COPY server ./server
COPY shared ./shared

RUN pnpm --filter @clipvibe/server build

WORKDIR /workspace/server

ENV NODE_ENV=production

EXPOSE 3001

CMD ["pnpm", "start"]
