# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project

SvelteKit (Svelte 5) static site: a gallery of thematic maps made in QGIS. Built by
`adapter-static`, served by Nginx.

## Commands

```bash
npm run dev / build / preview      # vite dev, static build -> ./build, preview the build
npm run check                      # svelte-kit sync + svelte-check
npm run format / lint              # prettier --write / --check (no eslint)
npm run test:unit / test:e2e       # vitest / playwright; `npm test` runs both, as CI does
```

Single tests: `npx vitest run src/x.spec.ts`, `npx vitest -t "name"`, `npx playwright test playwright/home.spec.ts`.

Dependencies via `ncu` (`ncu -u --target=patch|minor`, or `ncu -u && npm install` for majors).

**Playwright on Fedora** (the maintainer's OS): headless-shell runs natively — no `--with-deps`, no
sudo. The "OS is not officially supported" warning is expected; the ubuntu24.04 fallback build
works and the whole suite passes. Run `npx playwright install chromium-headless-shell` once, and
again after a Playwright bump — "Executable doesn't exist at .../chromium_headless_shell-<rev>" on
every spec is a missing download, not a broken test. Headed mode and WebKit/Firefox need libraries
Fedora lacks; use distrobox (`ubuntu:24.04`, `npx playwright install --with-deps`) for those.

## Architecture

### Routing

File-based under `src/routes`; root `+layout.svelte` is the navbar/footer shell. The home page
(`+page.svelte`) renders the gallery grid; `gallery/[slug]` is the per-map detail page; `about` is
static prose. Gallery content is a single source of truth in `src/lib/maps.ts` — add an entry, drop
images in `static/` and `static/hd/`, and both the grid and the detail page pick it up.

### Styling, build

- **Styling**: Tailwind v4 + DaisyUI via `@tailwindcss/vite` (no `tailwind.config.js`), theme in
  `src/app.css`. **The theme toggle keys off `data-theme`, never component state** — the theme is
  chosen by a blocking script in `app.html` before hydration, so a guessed `checked` attribute or an
  on-mount `$state` renders the wrong icon on the first frame. Anything theme-dependent has the same
  constraint. Component styles are unlayered and DaisyUI's are in `@layer utilities`, so they win.
- **Typography**: Archivo, self-hosted (zero third-party requests).
- **Static adapter** (`strict: true`): every route must be prerenderable; there is no server runtime.
- **Testing**: Vitest as a single `server` project over `src/**/*.{test,spec}.{js,ts}`; Playwright
  builds and previews on port 4173 before running `playwright/`.
- **Deployment**: the image is Nginx over the prebuilt `./build`. `cprod.yml` + `deploy.sh` on the
  host; CI publishes `oskarwestmeijer/maps` on push to `main`.
