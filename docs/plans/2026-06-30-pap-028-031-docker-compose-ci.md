# PAP-028 to PAP-031 Docker, Compose, and CI

Date: 2026-06-30
Status: Accepted for implementation
Tickets: PAP-028, PAP-029, PAP-030, PAP-031

## Scope

Implement the Docker and CI bootstrap slice after the PAP-001 through PAP-027 echo, trace,
worker, test, and QA baseline.

- Add production Docker images for the TanStack Start web app and worker.
- Add a local-first Compose file with `web`, `worker`, and a named `pap-data` volume.
- Add a production web start command that serves the built TanStack Start fetch handler.
- Add root Docker convenience scripts.
- Add a GitHub Actions CI workflow for quality gates.
- Extend Playwright so it can test an already-running Compose app through `PLAYWRIGHT_BASE_URL`
  while preserving the current auto-start behavior.
- Update repository, agent, and bootstrap documentation to reflect PAP-001 through PAP-031.

## Decisions

- Use multi-stage `node:24.15.0-bookworm-slim` Docker builds.
- Enable pnpm through Corepack and install with the frozen workspace lockfile.
- Build the workspace before creating production deploy outputs.
- Use `pnpm deploy --legacy --prod` for Docker runtime package materialization to avoid changing
  global workspace install semantics with `inject-workspace-packages`.
- Run runtime containers as non-root users.
- Use `/app/data` as the mounted persistent data directory in both containers.
- Use a direct `srvx@0.11.17` dependency in `@pap/web` to serve `dist/server/server.js`.
- Keep Compose local-first by binding the web port to `127.0.0.1:${PAP_PORT:-3000}` on the host.
- Set container defaults for self-hosted runtime paths and production logging.
- Use the current verified major GitHub Actions versions from 2026-06-30:
  `actions/checkout@v7`, `actions/setup-node@v6`, and `pnpm/action-setup@v6`.
- Keep Docker image and Compose verification local for this slice rather than adding Docker builds
  to every CI pull request.

## Files

- Add `.dockerignore`.
- Add `docker/web.Dockerfile`.
- Add `docker/worker.Dockerfile`.
- Add `compose.yml`.
- Add `.github/workflows/ci.yml`.
- Add `apps/web/server.mjs`.
- Update `apps/worker/src/index.ts`.
- Update `apps/web/package.json`.
- Update `apps/web/vite.config.ts`.
- Update root `package.json`.
- Update `e2e/playwright.config.ts`.
- Update `turbo.json`.
- Update `README.md`.
- Update `AGENTS.md`.
- Update `agents/rules/tooling.md`.
- Update `agents/rules/repository-boundaries.md`.
- Update `agents/skills/repository-bootstrap/SKILL.md`.
- Update `pnpm-lock.yaml` after adding the web runtime dependency.

## Dependencies

- Existing PAP-001 through PAP-027 implementation.
- Node.js and pnpm versions already declared by the repository.
- Docker with Compose support for local verification.
- Playwright browser dependencies already managed by the repository/tooling.

## Scripts

- `pnpm --filter @pap/web start`
- `pnpm docker:up`
- `pnpm docker:down`
- `pnpm docker:logs`

## Verification Commands

- `pnpm install`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm --filter @pap/web build`
- `pnpm --filter @pap/worker health`
- `docker build -f docker/web.Dockerfile -t pap-web:local .`
- `docker build -f docker/worker.Dockerfile -t pap-worker:local .`
- `pnpm docker:up`
- `docker compose ps`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e`
- `pnpm docker:down`
- `docker volume ls`

## Out Of Scope

- Contract, runtime, storage schema, and database migration changes.
- Dockerized Ollama.
- Dockerized SearXNG.
- Reverse proxy configuration.
- Deployment publishing.
- Real worker scheduling.
- Tool registry, skill loader, approval, memory, research, email, document, vector, or
  source-profile persistence.
- New UI beyond the existing echo and trace screens.
- Running QA-Intel in CI on every pull request.
- Building Docker images in CI for every pull request.
