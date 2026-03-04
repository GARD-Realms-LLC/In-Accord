![In-Accord Logo](./Images/in-accord-steampunk-logo.png)

## In-Accord — Social Your Way!

In-Accord is a desktop-ready, real-time social platform built with:

- Next.js (App Router) + TypeScript
- Electron (desktop shell)
- Clerk (authentication)
- Socket.IO (real-time updates)
- Drizzle ORM + MySQL
- UploadThing (file uploads)

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL database

## Environment setup

Create or update `.env` in the project root with at least:

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `UPLOADTHING_SECRET`
- `UPLOADTHING_APP_ID`

Optional:

- `ELECTRON_START_URL` (override Electron target URL)

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
