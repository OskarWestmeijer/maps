# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A SvelteKit (Svelte 5) static site for showcasing thematic maps created with QGIS, plus a small interactive Dijkstra pathfinding demo. Deployed as a static build served by Nginx.

## Commands

```bash
npm install              # install deps
npm run dev               # local dev server (vite dev)
npm run build              # production build via adapter-static -> ./build
npm run preview            # preview the production build

npm run check               # svelte-kit sync + svelte-check (type checking)
npm run check:watch          # same, in watch mode

npm run format               # prettier --write .
npm run lint                  # prettier --check . (this is the only lint step; there is no eslint)

npm run test:unit              # vitest (unit/component tests)
npm run test:e2e                # playwright (e2e tests against a built preview server)
npm run test                     # test:unit --run && test:e2e (full suite, as run in CI)
```

Run a single vitest test by name or file, e.g. `npx vitest run src/demo.spec.ts` or `npx vitest -t "adds 1 + 2"`.
Run a single playwright test, e.g. `npx playwright test playwright/home.spec.ts`.

Playwright does not run natively on Fedora (the maintainer's OS). On Fedora, run e2e tests inside distrobox:
```bash
distrobox create --name ubuntu --image ubuntu:24.04 --home ~/distrobox/ubuntu --additional-packages "git vim nodejs npm"
distrobox enter ubuntu
npx playwright install --with-deps
npm run test:e2e
distrobox stop ubuntu
```

Update dependencies with `npm-check-updates` (`ncu`): `ncu` to list, `ncu -u --target=patch|minor` for granular bumps, `ncu -u && npm install` for majors.

## Architecture

- **Routing**: SvelteKit file-based routing under `src/routes`. `+layout.svelte` renders the shared navbar/footer shell around all pages (Gallery `/`, Pathfinding `/pathfinding`, About `/about`, and dynamic map detail pages `/gallery/[slug]`).
- **Map data is a single static source of truth**: `src/lib/maps.ts` exports a `maps` array (slug, image paths, title, description, steps, HD link). The gallery page (`src/routes/+page.svelte`) lists all entries; `src/routes/gallery/[slug]/+page.ts` looks up a map by slug for the detail page. To add a new map: add an entry to `maps.ts` and drop its image(s) into `static/` (preview image referenced by `src`, full-resolution version under `static/hd/`).
- **Pathfinding demo** (`src/routes/pathfinding`) is self-contained, separate from the maps data: `src/lib/pathfinding/graph.ts` builds a fixed 7-node weighted graph with SVG-relative node positions, and `src/lib/pathfinding/dijkstra.ts` runs Dijkstra's algorithm over it and reconstructs shortest paths. The page renders the graph as inline SVG and highlights the path on node hover.
- **Static adapter**: `svelte.config.js` uses `@sveltejs/adapter-static` (`strict: true`), so every route must be prerenderable — there is no server runtime. Output goes to `./build`.
- **Styling**: Tailwind v4 + DaisyUI, configured via the `@tailwindcss/vite` plugin (no `tailwind.config.js`) and a custom DaisyUI theme defined directly in `src/app.css`.
- **Testing setup**: Vitest is configured in `vite.config.ts` as a single `server` project (Node environment) covering `src/**/*.{test,spec}.{js,ts}`, excluding `*.svelte.{test,spec}.ts`. Playwright (`playwright.config.ts`) builds and serves the app via `npm run build && npm run preview` on port 4173 before running specs in `playwright/`.
- **Deployment**: Docker image (`Dockerfile`) is just Nginx serving the prebuilt `./build` directory. `cprod.yml` is the production `docker compose` definition (expects an external `proxy` network and `./nginx/nginx.conf`); `deploy.sh` recreates the container from the latest pulled image. CI (`.github/workflows/main-build-test-release.yml`) builds, tests, and on push to `main` publishes the image to Docker Hub as `oskarwestmeijer/maps`.
