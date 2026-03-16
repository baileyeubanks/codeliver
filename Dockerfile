FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
EXPOSE 4103

# NAS Media Volume Mount
# When deploying via Coolify, add this volume mount to docker-compose:
#   volumes:
#     - /volume1/media:/volume1/media:ro   # Read-only NAS media access
#     - /volume1/media/uploads:/volume1/media/uploads  # Read-write for uploads
# Set NAS_MEDIA_ROOT=/volume1/media in the Coolify env

CMD ["sh", "-c", "npx next start --hostname 0.0.0.0 --port ${PORT:-4103}"]
