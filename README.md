# maps

![main branch](https://github.com/OskarWestmeijer/maps/actions/workflows/main-build-test-release.yml/badge.svg)
[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1pc14.svg)](https://uptime.betterstack.com/?utm_source=status_badge)

I create thematic maps with the tool QGIS. Most of the data used for creating the map, is free and provided by the Copernicus project.

- [https://maps.oskar-westmeijer.com](https://maps.oskar-westmeijer.com)

## Technologies

```
- Kotlin & Spring Boot
- Posgtres & Postgis extension
- Sveltekit & Vite
- Tailwind & DaisyUi
- Nginx
```

## Example map

Check out the website for more maps.

![Alt Netherlands elevation map](static/nl12_light.jpg)

## Prepared request

``` bash
curl -X GET http://localhost:8080/stations
```