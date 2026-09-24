# MoneyWrench

A household budget & savings tracker: accounts, categories, manual and
CSV-imported transactions, monthly budgets, and savings goals — all scoped
per household. See `docs/superpowers/specs/2026-09-20-budget-tracker-design.md`
for the full design spec and `tasks/plan.md` / `tasks/todo.md` for the
implementation plan.

## Stack

Next.js (App Router, TypeScript) · Prisma + Postgres · Auth.js (credentials)
· Tailwind · Vitest (unit/integration) · Playwright (E2E)

## Local setup

**Prerequisites:** Node 20+, Docker (for a local Postgres instance).

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the env template and fill it in:

   ```sh
   cp .env.example .env
   ```

   - `AUTH_SECRET`: generate a real value with `npx auth secret` (or
     `openssl rand -base64 33`) — never use the placeholder outside local
     dev.
   - `DATABASE_URL`: the placeholder already matches the Docker command
     below.

3. Start a local Postgres instance matching `.env.example`'s placeholder:

   ```sh
   docker run --name moneywrench-pg \
     -e POSTGRES_PASSWORD=moneywrench \
     -e POSTGRES_DB=moneywrench \
     -p 5432:5432 \
     -v moneywrench-pg-data:/var/lib/postgresql/data \
     -d postgres:16-alpine
   ```

   (On a later session, if the container already exists but is stopped:
   `docker start moneywrench-pg`.)

4. Apply migrations and seed a sample household/user/account/category:

   ```sh
   npx prisma migrate dev
   npm run db:seed
   ```

5. Start the dev server:

   ```sh
   npm run dev
   ```

   Visit `http://localhost:3000` and sign up (the seed data isn't tied to a
   password-login-ready account — sign up fresh to get a working session).

### Or: preview the whole stack in Docker

`docker-compose.yml` runs the app *and* its own Postgres together — no
local Node/Postgres setup needed, and it never touches the `moneywrench-pg`
container from step 3 above (its own Postgres is published on host port
**5433**, not 5432, specifically to avoid that clash).

```sh
docker compose up --build
```

Migrations are applied automatically on container start (see the
`Dockerfile`'s `CMD`). Visit `http://localhost:3000` and sign up.

> If your Docker setup hits `DNS: transient error` from `apk add` during
> the build, BuildKit's isolated build network can't resolve DNS in your
> environment — fall back to the classic builder:
> `DOCKER_BUILDKIT=0 docker compose up --build`.

Tear down with `docker compose down` (add `-v` to also delete its
Postgres volume and start fully fresh next time).

## Running tests

```sh
npm test          # Vitest: unit + integration tests (needs the Postgres
                   # container above running)
npm run test:e2e  # Playwright: one E2E happy-path test. Spins up its own
                   # `next dev` on port 3100 (see playwright.config.ts) and
                   # tears down its own test data afterward — safe to run
                   # alongside `npm run dev` on port 3000.
npm run lint
npm run build
```

## Deployment

The app is designed to deploy to Vercel against a production Neon Postgres
database, with **no code changes required** — only environment variables
differ between local dev and production (see `.env.example`'s comments on
`DATABASE_URL`).

1. **Provision a production database:** create a new Neon project
   (a database *separate* from local dev — never point production at the
   same instance you develop against). Copy its connection string.
2. **Create the Vercel project:** import this repository in the Vercel
   dashboard (or `vercel link` from this directory).
3. **Set environment variables** on the Vercel project (Production, and
   Preview if you want preview deployments to hit the same database):
   - `DATABASE_URL` — the Neon connection string from step 1
   - `AUTH_SECRET` — a fresh value from `npx auth secret` (do **not** reuse
     your local dev secret)
4. **Apply migrations to the production database** before or during first
   deploy:

   ```sh
   DATABASE_URL="<neon connection string>" npx prisma migrate deploy
   ```

5. **Deploy:**

   ```sh
   vercel deploy        # preview deployment
   vercel deploy --prod # production deployment
   ```

   or push to the branch Vercel is configured to auto-deploy from.

Steps 1–4 require your own Vercel/Neon accounts and can't be completed from
this repo alone — the app and its migrations are ready for them as soon as
you have a connection string and a Vercel project to point at them.
