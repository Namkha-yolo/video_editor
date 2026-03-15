FROM node:20-alpine AS builder

WORKDIR /workspace

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY client/package.json client/package.json
COPY shared/package.json shared/package.json

RUN pnpm install --frozen-lockfile --filter @clipvibe/client... || \
    pnpm install --no-frozen-lockfile --filter @clipvibe/client...

COPY client ./client
COPY shared ./shared

RUN pnpm --filter @clipvibe/client build

FROM nginx:1.27-alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
