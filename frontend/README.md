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

### Local test deployment

```bash
docker images rm maps:local

npm run build
docker build -t maps:local .
docker compose up
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