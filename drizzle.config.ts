import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const d1AccountId =
  process.env.CLOUDFLARE_ACCOUNT_ID || "e6170abf1613b7f0d6f016cda0f7fcf4";
const d1DatabaseId =
  process.env.CLOUDFLARE_D1_DATABASE_ID ||
  "34b0c741-8247-45bd-811f-12855ad69a90";
const d1ApiToken =
  process.env.CLOUDFLARE_API_TOKEN ||
  process.env.CF_API_TOKEN ||
  process.env.INACCORD_CLOUDFLARE_API_TOKEN ||
  "";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: d1AccountId,
    databaseId: d1DatabaseId,
    token: d1ApiToken,
  },
});
