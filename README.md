# In-Accord — Social Your Way

![Platform: In-Accord](https://img.shields.io/badge/Platform-In--Accord-6f42c1?style=for-the-badge)

![In-Accord Logo](./Images/in-accord-steampunk-logo.png)

In-Accord is a desktop-ready, real-time social platform built with:

- Next.js (App Router) + TypeScript
- Electron (desktop shell)
- Local database-backed authentication (session cookies)
- Socket.IO (real-time updates)
- Drizzle ORM + MySQL
- UploadThing (file uploads)

## In-Accord SDK (`In-Accord.js`)

This repository ships with a lightweight SDK client at `./In-Accord.js`.

### Quick start

```js
const { createInAccordClient } = require("./In-Accord.js");

const client = createInAccordClient({
	baseUrl: "http://localhost:3000", // local dev
});
```

### Moving to a domain (important)

When deploying, initialize the SDK with your real domain:

```js
const client = createInAccordClient({
	baseUrl: "https://your-domain.com",
});
```

If no `baseUrl` is passed, the SDK defaults to `http://localhost:3000`.

For more SDK details, see `INSTRUCTIONS.md`.

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL database

## Environment setup

Copy `.env.example` to `.env`, then fill values for your environment.

Required in `.env`:

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SESSION_SECRET`
- `UPLOADTHING_TOKEN`
- `UPLOADTHING_SECRET`
- `UPLOADTHING_APP_ID`

For `UPLOADTHING_TOKEN`, copy the token value directly from your UploadThing dashboard/project settings.
It must be the full base64 token string (JSON payload), with no surrounding quotes.

Optional:

- `ELECTRON_START_URL` (override Electron target URL)
- `INACCORD_UPDATE_MANIFEST_URL` (remote JSON manifest URL for desktop auto-updates)
- `INACCORD_UPDATE_CHECK_INTERVAL_MS` (optional check interval in milliseconds)
- `BOT_TOKEN_ENCRYPTION_KEY` (recommended; if not set, falls back to `SESSION_SECRET`)
- `SLASH_COMMAND_LIMIT_NON_IN_ACCORD` (default `100`)
- `SLASH_COMMAND_LIMIT_IN_ACCORD` (default `200`)

## Install

```bash
npm install
```

## Database (Drizzle)

```bash
npm run db:generate
npm run db:push
```

## Run (web)

```bash
npm run dev
```

Open `http://localhost:3000`.

## Run (desktop / Electron)

```bash
npm run electron:dev
```

## Production build

```bash
npm run build
npm run electron:pack
```

For a Windows installer:

```bash
npm run electron:dist
```

> Note: Windows installer creation may require elevated permissions depending on your local machine policy.

## Branding assets

Core brand image and icon outputs live under `Images/`, including:

- `in-accord-steampunk-logo.png`
- `fav.ico`

The app favicon/logo is wired to these assets via `app/favicon.ico` and public image references.

## Desktop on-the-fly updater (Electron)

The desktop app now includes a bootstrap-style updater that:

- checks a remote manifest on startup (and periodically),
- compares versions,
- downloads a new installer,
- verifies SHA-256 (if provided),
- prompts to install and relaunch.

Set in `.env`:

- `INACCORD_UPDATE_MANIFEST_URL=https://your-domain/releases/inaccord-manifest.json`

Example manifest:

```json
{
	"version": "0.1.1",
	"installerUrl": "https://your-domain/releases/In-Accord-Setup-0.1.1.exe",
	"sha256": "<sha256-hex>",
	"notes": "Bug fixes and UI improvements"
}
```
