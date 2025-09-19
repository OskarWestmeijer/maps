# maps

![main branch](https://github.com/OskarWestmeijer/maps/actions/workflows/main-build-test-release.yml/badge.svg)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1pc14.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

I create thematic maps with the tool QGIS. Most of the data used for creating the map, is free and provided by the Copernicus project.

- [https://maps.oskar-westmeijer.com](https://maps.oskar-westmeijer.com)

## Technologies

```
- Svelte & Vite
- Tailwind & DaisyUi
- Nginx
```

## Example map

Check out the website for more maps.

![Alt Netherlands elevation map](public/nl12_light.jpg)

## Build & test

```bash
npm install
npm run build
```

## Local development

```bash
npm install
npm run dev
```

## Update dependencies

Use ncu to update the dependencies. `npm install -g npm-check-updates`

```bash
# list possible updates
ncu

# granular updates
ncu -u --target=patch
ncu -u --target=minor

# run major updates
ncu -u
npm install
```