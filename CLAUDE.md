# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project

SvelteKit (Svelte 5) static site: a gallery of thematic maps made in QGIS, plus seven interactive
choropleths of Finland's municipalities. Built by `adapter-static`, served by Nginx.

## Commands

```bash
npm run dev / build / preview      # vite dev, static build -> ./build, preview the build
npm run check                      # svelte-kit sync + svelte-check
npm run format / lint              # prettier --write / --check (no eslint)
npm run test:unit / test:e2e       # vitest / playwright; `npm test` runs both, as CI does
```

Single tests: `npx vitest run src/x.spec.ts`, `npx vitest -t "name"`, `npx playwright test playwright/home.spec.ts`.

Statistics refresh (stdlib-only Python, no venv, no pip):

```bash
python3 scripts/fetch_statfi.py --dry-run --verbose   # fetch + validate, write nothing
python3 scripts/fetch_statfi.py [--only <table>]      # rewrite the copy in static/data
python3 -m unittest discover -s scripts -t scripts    # offline tests for query builder/validator
```

Dependencies via `ncu` (`ncu -u --target=patch|minor`, or `ncu -u && npm install` for majors).

**Playwright on Fedora** (the maintainer's OS): headless-shell runs natively — no `--with-deps`, no
sudo. The "OS is not officially supported" warning is expected; the ubuntu24.04 fallback build
works and the whole suite passes. Run `npx playwright install chromium-headless-shell` once, and
again after a Playwright bump — "Executable doesn't exist at .../chromium_headless_shell-<rev>" on
every spec is a missing download, not a broken test. Headed mode and WebKit/Firefox need libraries
Fedora lacks; use distrobox (`ubuntu:24.04`, `npx playwright install --with-deps`) for those.

## Architecture

### The load-bearing split: geometry is build input, statistics are runtime data

GeoJSON lives in `src/lib/interactive/`, is converted to SVG paths at build time, and is baked into
the prerendered page. It must **never** ship as a public asset. The PxWeb statistics live in
`static/data/`, are served at `/data/`, and are fetched by the browser on page open
(`liveData.ts`). That is what lets `fetch_statfi.py` refresh figures on the production host with no
rebuild, redeploy or restart. Consequences:

- `+page.server.ts` ships shapes with **every stat field present and null**. First paint is an
  outline map with hatched fills and em dashes; that null state _is_ the loading state.
- **Playwright assertions on figures or fills must auto-retry** (`toHaveAttribute`, `toBeVisible`),
  never a bare `await locator.getAttribute('fill')` — a one-shot read races the fetch and sees
  `url(#no-data)`. `fits-one-screen.spec.ts` waits for the period line before measuring.
- Nothing in `liveData.ts` throws. A 404 or malformed file leaves that file's figures null; the
  eight files are independent, so a lagging 12ti empties the software-jobs block while the map
  still colours from 12r5.
- The conversion must run in `+page.server.ts`, not a universal `+page.ts`: a universal load's
  `fetch` is inlined into the prerendered HTML for replay, which embedded the whole 475 kB GeoJSON.

### Routing

File-based under `src/routes`; root `+layout.svelte` is the navbar/footer shell. `/interactive` is
**not a page** — it's a shelf, one nested route per map, whose `+page.ts` redirects to
`/interactive/unemployment` and whose `+layout.svelte` renders the pill switch. Gallery content is
a single source of truth in `src/lib/maps.ts` (add an entry, drop images in `static/` and
`static/hd/`).

### Shared map machinery (`src/lib/interactive`)

All seven maps render inside `MapShell.svelte`, which owns the Finland/Region/Tampere tabs, the SVG
with hover/click/keyboard and the no-data hatch, the search box, the period + Sources popover row,
and the one-viewport desktop layout. A page supplies `metric`, `fillFor`, `valueLabel` and two
snippets (`panel`, `sources`); the shell owns `hovered`/`selectedCode`/`search`, and `region` is
`$bindable`. **Changing the shell changes all seven maps** — `fits-one-screen.spec.ts` covers them all.

Beside it: `StatRow.svelte`, `format.ts`, `views.ts` (`RegionId`/`ShellView` types live in a module
because a Svelte component can't export types from its instance script), `loadGeometry.ts`,
`membership.ts`, `regions.ts`, `score.ts`, and one parser per table.

- **Geometry**: `finland_kunnat_2km.geojson` (308 municipalities), `finland_maakunnat_500m`,
  `tampere_kunnat_20m`. CRS is **EPSG:3067**, already planar metres — no reprojection; coordinates
  are emitted `x,-y` and the viewBox does the scaling. Replace a file to update a map.
- **Every panel names the hovered municipality's maakunta.** It rides on each area as `regionName`,
  derived geometrically by `membership.ts` (largest-ring centroid, point-in-polygon) and shipped as
  `membersOf` — the exports carry region _totals_, never a membership list. So **every**
  `+page.server.ts` calls `assignToRegions`/`assertCompleteAssignment`, which fails the build if a
  municipality lands in zero or several regions. Empty on the Region tab and on roll-ups.
- **Regional toggle** is a client-side `$state` flip, not a route: all three payloads ship in one
  page. Because the component doesn't remount, `switchRegion` must reset
  `hovered`/`selectedCode`/`search` explicitly. Tampere Metro's 8 municipalities are hand-listed in
  `regions.ts` (no seutukunta→kunta table exists in any source). `toFinlandMap`'s `paddingRatio`
  exists because a bbox around 8 contiguous municipalities has no natural margin.
- **Hand-rolled formatting** (`format.ts`), never `toLocaleString`/`Date`: output is identical
  everywhere, and `formatDate` reads the UTC string rather than constructing a `Date`, which would
  shift the poll date west of Greenwich. `sourceLine` joins fragments with `·`, skipping missing ones.
- **Typography**: Archivo, self-hosted (zero third-party requests). The width axis carries
  hierarchy: `.display-wide` for headings/figures, `.stat-label` for micro-labels;
  `font-variant-numeric: tabular-nums` on `body`. Defined in `src/app.css`.
- **No swatch legend on any map, deliberately.** Its job is done by the search box plus the panel's
  **chip** — tinted with the exact fill the map used and carrying the number that explains it.
  Don't reintroduce one. Clicking a municipality or picking a search result sets a persistent
  `selectedCode` (blue, `SELECTED_FILL`); `hovered` only previews; `displayed = hovered ?? selected`.

### One-viewport layout

`main` is `lg:h-[calc(100dvh-var(--map-chrome,9.5rem))]` — 9.5rem is navbar + footer, and the
interactive layout raises `--map-chrome` to 12.9rem for its pill switch. Re-measure if either
changes. The tinted sheet is `min-h-0 flex-1` and stays the same size in every region (the SVG
letterboxes inside it; sizing per region made the frame jump on tab change). Below `lg` it stacks
and scrolls. `fits-one-screen.spec.ts` asserts, at three desktop sizes, both that the document
doesn't overflow **and** that the panel card stays inside `main` — every new indicator is another
row, so that spec is what catches a panel growing past the fold.

### The seven maps

Every map: same three geometry tabs, same shell, `DIVERGING_SCALE` colours (green good, red bad),
seven classes unless noted, band edges picked against the real distribution.

| Map            | Measure                                              | Scale pivots on         | Region tab      | Metro tab               |
| -------------- | ---------------------------------------------------- | ----------------------- | --------------- | ----------------------- |
| `unemployment` | registered unemployment rate (`TYOTOSUUS`, 12r5)     | national rate           | 12r5 `MK` rows  | roll-up                 |
| `population`   | change per 1 000 (`kokmuutos`÷`vaesto`, 121w)        | zero                    | roll-up         | roll-up                 |
| `income`       | median disposable income per consumption unit (14ww) | national median         | 14ww `MK` rows  | **none possible**       |
| `education`    | share of 15+ with a tertiary degree (12bs)           | **median municipality** | 12bs `MK` rows  | roll-up                 |
| `age`          | mean age (11ra)                                      | **median municipality** | 11ra `MK` rows  | weighted roll-up        |
| `balance`      | distance from a 50/50 sex split (11re)               | 50 %, a constant        | roll-up         | roll-up                 |
| `compare`      | composite 0–100 score                                | 50th percentile         | ranked among 19 | municipal scores reused |

Per-map facts that aren't obvious from that table:

- **unemployment** — the metric is the _register_ rate, not Tilastokeskus's headline työttömyysaste
  (Labour Force Survey, no municipal breakdown). Both are official statistics; the distinction is
  **register vs sample survey**, not official vs unofficial, and the Sources popover says so in two
  badged sections. **Don't reword it into "official vs survey".** Both national rates are shown side
  by side on purpose (135z, `tyottaste_trendi`, looked up by column **code** — `Työttömyysaste, %`
  is a strict prefix of the trend and adjusted columns); removing one makes the other read as a bug.
  `TYOVOIMATK` is ~2 years older than the monthly counts. Total population is not in this export.
- **population** — annual, not the monthly sibling 12as: a single December's flows are 0 or ±1 in a
  small municipality and seasonally skewed. **Net change ≠ natural change + net migration**: the
  published `kokmuutos` also contains `vakorjaus` (register corrections), nonzero for 220 of 308, so
  the panel renders it as a third row when nonzero. Don't recompute `totalChange` from the flows.
  Density is a panel stat (`vaesto` ÷ the geometry's `landarea`), not the mapped measure.
- **income** — **a median is not additive**, so `income.ts` deliberately has **no** `aggregate*`
  function; there's a comment saying so because adding one is the obvious "fix". Hence the metro tab
  has no headline at all (`total: null`) and says why. `SK064` is not a stand-in: 11 municipalities
  against the metro's 8. The municipal figures come from tulonjakotilasto's register-based **total**
  dataset, not its sample survey — don't reword that either.
- **education / age** — both pivot on the **median municipality**, not the national figure, because
  the national one counts _people_: only 42 of 308 reach the national degree share, and only 58 are
  below the national mean age. Pivoting nationally paints ~86 % of either map one colour. The
  reference (`medianShare` / `medianAge`) rides on every view so colours don't move between tabs,
  and the chip therefore reads "vs median municipality" — the chip must answer the same question its
  tint does. Age's green-is-young direction is a **judgement**, stated as such in its popover, and
  paired with `higherIsBetter: false`; move both together. `aggregateAgeStats` must be
  **population-weighted**. A sequential purple ramp was tried for education and rejected as harder
  to read than hue; its validated steps are recorded in a comment above `EDUCATION_CLASSES`.
- **balance** — measures distance from parity, so **it has no sign**: 52,2 % and 47,8 % women take
  the same colour. Green/red runs over that single magnitude the way `SCORE_CLASSES` does, six
  classes, no midpoint. A purple/orange scale encoding _which_ sex led came first and was rejected
  as undecodable without a legend; reframing as balance is what made green/red honest. Direction
  lives in the panel (share + both counts), not the map.

### Parsers, and the shapes that bite

One module per table, all sharing conventions: columns matched **on the suffix after the last `-`**
(exports mix `tjt-ekvikturaha_med` with `gini_kturaha`; a code with no `-` is its own suffix),
matching **exact** (`rpt_aste` sits beside `pit_rpt_aste`; `kaste3` beside `kaste3T8`), the period
read from the file rather than the filename, and the area identified **by shape, not position**
(key order differs per table and has changed before). A row's `values` holds **only** the content
columns (`type: 'c'`), so indexes resolve against that filtered list. Suppressed cells are `'...'`
or `'.'` and must stay `null`, never 0. Only numeric `KU###`/`MK##` codes are mapped — exports also
carry `SSS`, `SK`, `ELY`, `MA1`/`MA2`, `KUJOU`, and 11ra's sixteen area levels.

Two exceptions worth knowing:

- **`softwareJobs.ts`** sums three occupation groups (2513/2514/2519) per area, so a partially
  suppressed area would understate silently; each figure carries an `...IsMinimum` flag. Computed
  and tested, not surfaced in the UI (by request).
- **`balance.ts`** gets three rows per area (total/men/women) and must pivot them, and its
  whole-country key is `['SSS','SSS','2025']` — area code and sex code are the same string, so
  pattern-matching picks the wrong one. `dimensions()` resolves positions from `columns` instead.

### Aggregation rules (all four cases are live)

A plain count sums (`aggregatePopulationStats`). A ratio of counts aggregates exactly through its
numerator (`aggregateEducationStats`, `aggregateBalanceStats`) — recompute from the sums, never
average the members' ratios. A mean aggregates exactly **only weighted** (`aggregateAgeStats`). A
median cannot be aggregated at all. Check which case a new measure is before reaching for a roll-up.

### The refresh script (`scripts/fetch_statfi.py`)

Eight tables under `https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin`: `tyonv/12r5`, `tyonv/12ti`,
`ssaaty/121w`, `tjt/14ww`, `vkour/12bs`, `vaerak/11ra`, `vaerak/11re`, `tyti/135z`. A `POST` with
`{"response":{"format":"json"}}` returns exactly the shape the parsers read, written verbatim —
moving to a new period needs no code change.

Variables are resolved from the PxWeb metadata, never hardcoded, because Statistics Finland renames
codes (the 8.6.2026 change did; `alue_23_20260101` is already dated):

- time variable = the one flagged `time`, `top 1`;
- `select` narrows a variable to marker-identified values (12ti's occupations, 11ra's 43 measures);
- `omit` drops an `elimination: true` variable entirely so PxWeb returns its own total — this is
  what turns 12bs's 14 850 rows into 330. Keyed by **several** markers, because `SSS` is offered by
  the area, age and sex variables alike. Two guards, since failure here is silent: a rule matching
  no variable raises, and so does omitting a variable that is no longer eliminable.

**It validates before writing**: required content columns present, an `SSS` row, `min_rows` (a floor
catches a table that stopped publishing) and `max_rows` (only a ceiling catches a query that stopped
narrowing). On failure it exits non-zero and leaves the previous file untouched.

Output says **written** or **left alone** (byte-identical — the usual case); "left alone" is not a
failure. Files are named `<measure>_<source type>_<scope>_<pxweb-table-id>`, with no period in the
name since they're overwritten in place. `manifest.json` carries three dates per file — `period`
(what the figures describe), `updated` (when Statistics Finland published), `polled` (when we last
asked); only `polled` moves on a no-change run and only `polled` is rendered. It is **gitignored**,
so it's absent from a fresh clone and the built image until the script runs — the maps then omit the
poll date, and `liveData.spec.ts` synthesizes its own fixture. The manifest is **merged**, so
`--only` or a partial failure can't drop other files' entries.

### Compare map (`src/routes/interactive/compare`)

A composite score, not a published statistic: six indicators, equal weights, one 0–100 per area.
`score.ts` is kept free of Svelte, geometry and fetching so the formula is testable alone.

- **Percentile rank, not z-score or min–max.** The measures are on incompatible units and one has a
  long tail (Kökar's −75,8 per 1 000). Ties take the average of the ranks they span, nulls are
  excluded from the denominator, and the `n − 1` denominator makes the best exactly 100.
- **`MIN_COVERAGE = 1`** — an area is scored only when _every_ indicator is published for it. Not a
  placeholder: scoring on a subset silently re-weights it, and run that way **Föglö came out first
  of 308** on its population change alone. The four unscored areas are the Åland municipalities with
  no unemployment rate; no later domain narrowed that set. With six domains this could now drop to
  ~0.6 — the `isPartial` path is built and tested but can't fire at 1.
- **Municipal scores never change between tabs**: the 308 are ranked once and the metro tab reuses
  the figures. Take only the _figures_ — spreading the whole area object brings its `d`, replacing
  the metro's 20 m geometry with 2 km shapes. Pinned in both `liveData.spec.ts` and `compare.spec.ts`.
  Regions are ranked among the 19, so **a region's score isn't comparable to a municipality's**.
- The **balance indicator carries a caveat the others don't**: it correlates −0,47 with log
  population (one person is a whole percentage point in a municipality of 101), so the smallest
  places are charged partly for arithmetic. Kept because it's the least redundant of the six (−0,24
  against the other five's composite, where age is −0,77). Its regional figure must be **pooled and
  then measured**, not averaged.
- The no-selection panel shows the **ends of the ranking**, since a national composite would be
  Finland's percentile among itself. The lower block takes what's left after the top five so the
  metro's eight can't appear twice; the region column drops when every row shares one region.
- **The map colours by `scorePercentile`, not by `score`** — the score's own rank among the scored
  areas. A score is a _mean_ of percentile ranks, and a mean of ranks clusters towards the middle,
  harder with every indicator added: the top-10 % band held 9 municipalities with two indicators and
  **1** with six. Ranking the score first makes the band labels true by construction (31/45/61/30/61/45/31
  of 304 today) and keeps them true as domains land. `score.spec.ts` pins it; pass the raw score to
  `scoreColorFor` and the labels start lying again.
- The breakdown is a real `<table>` (Indicator / Figure / Percentile) with no caption — the headers
  say it. The two numbers were once concatenated into one cell and that made every read a decode.

### Map switch, styling, build

- **Each pill names the measure, not the topic** — "Unemployment rate", "Population change",
  "Median income", "Higher education", "Average age", "Gender balance", "Compare". Labels live in
  `+layout.svelte`'s `maps` array, and each page's `<title>` and `metric` prop must match, since the
  e2e specs address maps by that label. `.map-switch` wraps; seven pills are wider than a phone.
- **Styling**: Tailwind v4 + DaisyUI via `@tailwindcss/vite` (no `tailwind.config.js`), theme in
  `src/app.css`. **The theme toggle keys off `data-theme`, never component state** — the theme is
  chosen by a blocking script in `app.html` before hydration, so a guessed `checked` attribute or an
  on-mount `$state` renders the wrong icon on the first frame. Anything theme-dependent has the same
  constraint. Component styles are unlayered and DaisyUI's are in `@layer utilities`, so they win.
- **Static adapter** (`strict: true`): every route must be prerenderable; there is no server runtime.
- **Testing**: Vitest as a single `server` project over `src/**/*.{test,spec}.{js,ts}`; Playwright
  builds and previews on port 4173 before running `playwright/`.
- **Deployment**: the image is Nginx over the prebuilt `./build`. `cprod.yml` + `deploy.sh` on the
  host; CI publishes `oskarwestmeijer/maps` on push to `main`.
- **Statistics refresh is image-free**: `refresh-data.yml` runs daily, SSHes in, and runs the script
  with `--out ./data`. `cprod.yml` mounts that read-only at `/srv/live/data`; nginx serves `/data/`
  with `try_files $uri @baked_data` — mounted file first, then the copy inside the image, so an
  empty or missing mount falls back to the built-in vintage rather than going blank. `no-store`, so
  a refreshed file is picked up on the next load.

## Adding a domain (housing next)

Income, education, age and balance all landed this way. One indicator per domain, its own map page
only where it earns one.

**Household debt (`velk/157y`, `velk/15c1`) is the obvious next one**, and the script change it
needs is already done — those tables carry the same eliminable breakdowns 12bs did, so declaring
`omit` markers covers them. Note **municipal finance is not in StatFin at all**; it moved to
Valtiokonttori, a different publisher and API.

1. Add the table to `TABLES` with `required_contents`, `min_rows`, plus `omit`+`max_rows` or
   `select` as needed, and run the script.
2. Add a parser module, following the conventions above.
3. Add the file to `FILES`, a field to `CompareArea` and `blankArea`, and an accessor in
   `loadCompareViews`. Decide the region rule here: published `MK` rows, or a `membersOf` roll-up —
   and check the measure can be aggregated at all first.
4. Add one `INDICATORS` entry (`valueOf`, `format`, `higherIsBetter`, `weight`). Panel, colours,
   ranking and coverage all pick it up. **Skip this step if the measure has no defensible better
   direction** — a map page without an indicator is a valid outcome.
5. Optionally a map page: `+page.server.ts`/`+page.svelte` around `MapShell`, a pill in the
   interactive layout, an entry in `fits-one-screen.spec.ts`. Then add the new period/source/poll
   fields to `CompareView` and to the compare page's Sources popover, "What goes into it" list and
   `failed` guard, all of which name every table explicitly.
