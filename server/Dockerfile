FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

EXPOSE 3001

CMD ["pnpm", "dev"]
