# In-Accord SDK Instructions

## What this is

This project includes a lightweight SDK at `In-Accord.js` for calling In-Accord API routes.

## Install / import

Use CommonJS:

- `const { InAccord, createInAccordClient } = require("./In-Accord.js");`

## Initialize the SDK

Create one client instance and reuse it.

### Local development

- `const client = createInAccordClient({ baseUrl: "http://localhost:3000" });`

### Production / custom domain

- `const client = createInAccordClient({ baseUrl: "https://your-domain.com" });`

> If `baseUrl` is not provided, the SDK defaults to `http://localhost:3000`.

## Auth helpers

- `client.setHeader(name, value)` for custom headers.
- `client.setBearerToken(token)` to set/remove `Authorization: Bearer <token>`.

## Basic usage examples

- Sign in: `client.signIn({ email, password })`
- Create server: `client.createServer(payload)`
- Send message: `client.sendMessage({ serverId, channelId, content })`
- Delete message: `client.deleteMessage({ serverId, channelId, messageId })`
- Join voice: `client.joinVoice({ serverId, channelId })`

## Important deployment note

When moving from localhost to a domain, update `baseUrl` during SDK initialization. If you keep the default localhost URL in production, requests will fail.

## Channel group policy (important)

- Do **not** auto-create channel groups in normal server/channel flows.
- `AUDIO`, `VIDEO`, and `stage` channels must remain ungrouped by default unless a user explicitly assigns one (and `stage` remains ungrouped by system policy).
- Auto-creation of channel groups is allowed **only** in template flows:
  - template export may synthesize type groups for payload completeness,
  - template import should auto-create missing type groups and map imported channels into them.
