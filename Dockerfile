FROM node:20-alpine

WORKDIR /app

# Prisma's query engine needs OpenSSL on Alpine's musl libc; libc6-compat
# smooths over a few native-module glibc assumptions in Next.js's toolchain.
RUN apk add --no-cache openssl libc6-compat

# `npm ci` runs this project's own `postinstall` script (`prisma generate`),
# which needs prisma/schema.prisma to already be present — so that has to
# be copied in BEFORE `npm ci`, not after, even though the rest of the
# source isn't needed yet. package.json/package-lock.json/prisma/ changing
# together is what invalidates this layer's cache; editing app code alone
# doesn't force a re-install.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# Build-time-only placeholders: every DB/session-touching route in this
# app is server-rendered on demand (ƒ), not statically prerendered — see
# `npm run build`'s own route summary — so neither var is actually read
# during the build itself. They exist only so NextAuth's module-load-time
# checks don't fail in an environment with no real secret yet. The real
# values come from docker-compose's `environment:` at container run time,
# which overrides these.
ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/moneywrench"
ARG AUTH_SECRET="docker-build-placeholder-not-used-at-runtime"
ENV DATABASE_URL=${DATABASE_URL}
ENV AUTH_SECRET=${AUTH_SECRET}

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Applies any pending migrations against the REAL runtime DATABASE_URL
# (docker-compose's environment:, not the build ARG above) before serving —
# a no-op once the schema is current, so this image is self-sufficient for
# a `docker compose up` preview with no separate migration step to run by
# hand.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
