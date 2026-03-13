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
  turbopack: {
    resolveAlias: {
      "discord.js": "./lib/shims/discord-client-shim.js",
      "@discordjs/ws": "./lib/shims/empty-client-module.js",
      "zlib-sync": "./lib/shims/empty-client-module.js",
      bufferutil: "./lib/shims/empty-client-module.js",
      "utf-8-validate": "./lib/shims/empty-client-module.js",
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.cache = {
        type: "memory",
      };
    }

    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "discord.js": require("node:path").resolve(__dirname, "./lib/shims/discord-client-shim.js"),
        "@discordjs/ws": require("node:path").resolve(__dirname, "./lib/shims/empty-client-module.js"),
        "zlib-sync": require("node:path").resolve(__dirname, "./lib/shims/empty-client-module.js"),
        bufferutil: require("node:path").resolve(__dirname, "./lib/shims/empty-client-module.js"),
        "utf-8-validate": require("node:path").resolve(__dirname, "./lib/shims/empty-client-module.js"),
      };
    }

    return config;
  },
  async redirects() {
    return [
      {
        source: "/our-board",
        destination: "/in-aboard",
        permanent: false,
      },
      {
        source: "/our-board/:path*",
        destination: "/in-aboard/:path*",
        permanent: false,
      },
    ];
  },
}

module.exports = nextConfig
