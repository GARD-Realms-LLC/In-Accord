/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "discord.js",
    "@discordjs/ws",
    "zlib-sync",
    "bufferutil",
    "utf-8-validate",
  ],
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPE_ERRORS === "1",
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/api/r2/object/**",
      },
      {
        protocol: "https",
        hostname: "localhost",
        port: "3000",
        pathname: "/api/r2/object/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3000",
        pathname: "/api/r2/object/**",
      },
      {
        protocol: "https",
        hostname: "127.0.0.1",
        port: "3000",
        pathname: "/api/r2/object/**",
      },
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
        pathname: "/gh/twitter/twemoji@*/assets/72x72/**",
      },
    ],
  },
}

module.exports = nextConfig
