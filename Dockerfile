# QueenBee's production image.
#
# Debian (not Alpine) because `sharp` ships glibc prebuilds. The image is built from Git by Coolify
# and runs `next start` on port 3000 behind Traefik.
#
# `public/catalog` and `public/hero` are deliberately excluded from the build context and mounted as
# persistent volumes: uploaded bytes must survive a container replacement. The image still carries
# `public/brand`, the favicons and the SVG placeholders.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    QUEENBEES_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Runtime needs the built app, the Next config, and the modules the pre-deploy migration gate and
# `db:migrate` call through `tsx`. Dev dependencies stay because those commands are part of deploy.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle

# Volumes are mounted at these paths. Creating them here makes a fresh container writable before the
# host directories exist.
RUN mkdir -p public/catalog public/hero .data/payment-proof \
    && chown -R node:node /app/.next public/catalog public/hero .data

USER node
EXPOSE 3000
CMD ["npm", "start"]