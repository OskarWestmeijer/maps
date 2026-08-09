# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A SvelteKit (Svelte 5) static site for showcasing thematic maps created with QGIS, plus an interactive map of Finland's municipalities. Deployed as a static build served by Nginx.

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

Playwright on Fedora (the maintainer's OS): the headless-shell browser **does** run natively, without `--with-deps` or sudo — Playwright prints a "your OS is not officially supported" warning and downloads the ubuntu24.04-x64 fallback build, which works. The whole suite passes this way:

```bash
npx playwright install chromium-headless-shell   # once, and again after a Playwright bump
npm run test:e2e
```

If a Playwright upgrade pulls in a browser revision that isn't installed, every spec fails with "Executable doesn't exist at .../chromium_headless_shell-<rev>" — that is a missing download, not a broken test; re-run the install command.

Full browsers (headed mode, WebKit/Firefox) still need the system libraries Fedora lacks, so for those use distrobox:

```bash
distrobox create --name ubuntu --image ubuntu:24.04 --home ~/distrobox/ubuntu --additional-packages "git vim nodejs npm"
distrobox enter ubuntu
npx playwright install --with-deps
npm run test:e2e
distrobox stop ubuntu
```

Update dependencies with `npm-check-updates` (`ncu`): `ncu` to list, `ncu -u --target=patch|minor` for granular bumps, `ncu -u && npm install` for majors.

## Architecture

- **Routing**: SvelteKit file-based routing under `src/routes`. `+layout.svelte` renders the shared navbar/footer shell around all pages (Gallery `/`, Interactive `/interactive`, About `/about`, and dynamic map detail pages `/gallery/[slug]`).
- **Map data is a single static source of truth**: `src/lib/maps.ts` exports a `maps` array (slug, image paths, title, description, steps, HD link). The gallery page (`src/routes/+page.svelte`) lists all entries; `src/routes/gallery/[slug]/+page.ts` looks up a map by slug for the detail page. To add a new map: add an entry to `maps.ts` and drop its image(s) into `static/` (preview image referenced by `src`, full-resolution version under `static/hd/`).
- **Interactive Finland map** (`src/routes/interactive`) is self-contained, separate from the maps data. The source is `src/lib/interactive/finland_kunnat_2km.geojson` (308 municipalities, MultiPolygon, simplified to a 2 km tolerance — replace this file to update the map). It deliberately lives in `src/lib`, **not** `static/`: it is build input, not a public asset, so it must not be copied into the image. `src/lib/interactive/finland.ts` converts it to SVG path data — the CRS is **EPSG:3067 (TM35FIN)**, already a planar projection in metres, so no reprojection library is needed; coordinates are emitted as `x,-y` (Y flip) and the `viewBox` derived from the data bounds does all the scaling. The page renders one `<path>` per municipality and fills a side panel on hover. Only `natcode`/`namefin`/`nameswe` are read from the GeoJSON — it also carries land/water area figures, but the info panel shows employment counts instead, so they are left out of the payload.
  - The conversion runs in `+page.server.ts`, **not** a universal `+page.ts`, and this matters: a universal load's `fetch` gets inlined into the prerendered HTML verbatim so the client can replay it, which embedded the whole 475 kB GeoJSON (649 kB page). A server load runs once at build time and only its compact result is serialized (~330 kB page). `adapter-static` handles `+page.server.ts` fine as long as the route is prerendered.
  - **Choropleth data**: `src/lib/interactive/unemployment_register_kunnat_2026-06_12r5.json` is a PxWeb export from KEHA-keskus / Työnvälitystilasto, table 12r5 ("Työttömät työnhakijat eri ryhmissä, palveluissa olevat ja avoimet työpaikat kuukauden lopussa"). `src/lib/interactive/unemployment.ts` parses it and joins to the geometry on `natcode`. Two PxWeb quirks it handles: each row's `values` array holds **only the content columns** (`type: 'c'`), so the rate's index must be resolved against that filtered list rather than `columns`; and suppressed figures are the string `'...'`, which must stay `null` instead of becoming 0. The file also carries region-level rows (`MK`/`SK`/`ELY`), a whole-country `SSS` row and a `KUJOU` "unknown municipality" bucket — only numeric `KU###` codes are mapped.
  - The metric is `TYOTOSUUS`, the share of _registered unemployed jobseekers_ in the labour force — **not** Tilastokeskus's headline työttömyysaste, which comes from the Labour Force Survey (a sample survey with no municipal breakdown, so it cannot be mapped). The register figure runs a few points higher; label it accordingly in UI copy.
  - **Both series are official statistics** (Suomen virallinen tilasto) — the real distinction is _administrative register_ vs _sample survey_, not official vs unofficial. The survey one is Tilastokeskus's official headline rate; being a survey does not make it less official. The Sources popover states this explicitly, in two labelled sections with Register/Survey badges. Don't reword it into "official vs survey".
  - **Both national rates are shown side by side on purpose.** `src/lib/interactive/unemployment_survey_national_2026-06.csv` is Tilastokeskus table 135z (Labour Force Survey key figures), parsed by `src/lib/interactive/survey.ts`, which takes the `Työttömyysaste, %, trendi` column — the number stat.fi advertises (10,5 % for 2026M06 against the register's 12,8 %). It is national-only and never colours the map. Displaying the two together, labelled, is what stops the map's higher figures reading as a bug; do not remove one without the other. Note `Työttömyysaste, %` is a strict prefix of the trend and seasonally-adjusted column names, so the lookup must be an exact match — a prefix match silently returns the wrong series.
  - The info panel also shows three absolute counts: `TYOVOIMATK` (labour force), `HAKIJALOPUSSA` (all jobseekers, including those in work) and `TYOTTOMATLOPUSSA` (unemployed jobseekers — the numerator behind the rate). Caveat worth keeping in mind: per its own column comment, `TYOVOIMATK` comes from Tilastokeskus's employment statistics and is typically ~2 years older than the monthly jobseeker counts. **Total population is not in this export** — adding it needs a separate väkiluku-by-municipality source, joined on the same `natcode`.
  - **Data files are named `<measure>_<source type>_<scope>_<period>[_<pxweb-table-id>]`** — e.g. `unemployment_register_kunnat_2026-06_12r5.json`, `unemployment_survey_national_2026-06.csv`. The period in the name is the statistics month, not the download date (the JSON carries its own `metadata.updated` for that). The trailing PxWeb table id (e.g. `12r5`) is appended when known, so the source table can be searched for again later — it's the code shown in the PxWeb URL/UI for that specific table, not a Statistics Finland table-collection number. Updating to a newer month therefore means dropping in the file, renaming it to the new period (keeping the table id), and editing the two import paths in `+page.server.ts`; the code itself reads the period out of the file contents, so the filename is documentation and can drift if you forget.
  - **Layout is pinned to one viewport at `lg` and up**: `main` is `lg:h-[calc(100dvh-9.5rem)]` (the 9.5rem is the navbar + footer from `+layout.svelte`), the SVG box is `min-h-0 flex-1` so the map letterboxes into whatever the period/sources row leaves, and the sources/attribution text lives in a `<details class="dropdown">` popover rather than inline. Below `lg` it stacks and scrolls. `playwright/fits-one-screen.spec.ts` asserts no vertical overflow at three desktop sizes — if you add anything to this page (the info panel especially, since it grows with every dataset joined onto it), that spec is what catches it pushing the search box or Sources button below the fold. Adjust the `9.5rem` if the navbar or footer height ever changes.
  - There is deliberately **no colour-swatch legend** — removed in favour of a municipality search box (typed, filtered dropdown of matches — not a native `<datalist>`, whose Chromium picker-arrow reads as a combo/multi-select) at the top of the side panel. Picking a result, or clicking a municipality on the map directly, sets a persistent `selectedCode` that fills it blue on the map (`class:selected`, `SELECTED_FILL`) independent of `hovered`, which only ever previews; the panel reads `displayed = hovered ?? selected`, falling back further to the whole-country figures when neither is set. The map still colour-codes by `colorFor(rate)` — only the explanatory swatches are gone, so the number is always shown alongside the colour instead (hover/selection panel, `aria-label`).
  - Panel numbers are formatted by hand (`count`/`percent` in `+page.svelte`) rather than with `toLocaleString`. ICU group separators differ between Node and browser builds, and these strings are prerendered then hydrated, so locale formatting would risk a hydration mismatch.
  - The colour ramp in `unemployment.ts` is green→red per request, which is the classic red-green colour-blindness trap. It is mitigated by making **lightness fall monotonically** across all six classes, so magnitude still reads when hue collapses, and by always showing the number. If you re-pick the colours, keep lightness monotone — validated with the `dataviz` skill's `validate_palette.js --ordinal`.
  - **Personal-interest slice**: `src/lib/interactive/software_occupations_register_kunnat_2026-06_12ti.json` (PxWeb table 12ti) adds unemployed jobseekers and open vacancies for three occupation groups — web/multimedia developers, applications programmers, and software/app developers n.e.c. (codes 2513/2514/2519) — broken down by municipality _and_ occupation group. `src/lib/interactive/softwareJobs.ts` sums the three groups per area into one figure; it never colours the map, only the side panel (`softwareStats`, rendered via a `{#snippet softwareJobsBlock()}` shared by the hovered/selected and national branches). Suppression here is handled more carefully than in the main register file: because a _sum_ of three PxWeb cells is involved, a partially-suppressed area (some groups known, some `'...'`) would silently understate the total if nulls were just skipped — so each figure carries an `...IsMinimum` flag recording that it's a lower bound. The panel doesn't currently surface that flag (by request — no `+` markers in the UI), but it's computed and tested so a future caveat/tooltip has it to hand.
- **Static adapter**: `svelte.config.js` uses `@sveltejs/adapter-static` (`strict: true`), so every route must be prerenderable — there is no server runtime. Output goes to `./build`.
- **Styling**: Tailwind v4 + DaisyUI, configured via the `@tailwindcss/vite` plugin (no `tailwind.config.js`) and a custom DaisyUI theme defined directly in `src/app.css`.
- **Testing setup**: Vitest is configured in `vite.config.ts` as a single `server` project (Node environment) covering `src/**/*.{test,spec}.{js,ts}`, excluding `*.svelte.{test,spec}.ts`. Playwright (`playwright.config.ts`) builds and serves the app via `npm run build && npm run preview` on port 4173 before running specs in `playwright/`.
- **Deployment**: Docker image (`Dockerfile`) is just Nginx serving the prebuilt `./build` directory. `cprod.yml` is the production `docker compose` definition (expects an external `proxy` network and `./nginx/nginx.conf`); `deploy.sh` recreates the container from the latest pulled image. CI (`.github/workflows/main-build-test-release.yml`) builds, tests, and on push to `main` publishes the image to Docker Hub as `oskarwestmeijer/maps`.
