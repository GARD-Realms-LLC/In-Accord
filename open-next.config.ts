import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

config.buildCommand = "node scripts/build-cloudflare.cjs";

export default config;
