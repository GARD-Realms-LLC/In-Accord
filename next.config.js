/** @type {import('next').NextConfig} */
const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

initOpenNextCloudflareForDev();

const serverOnlyExternalPackages = new Set([
  "pg",
  "pg-pool",
  "pg-connection-string",
  "pgpass",
  "split2",
]);

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: process.env.NEXT_OUTPUT_MODE === "standalone" ? "standalone" : undefined,
  serverExternalPackages: [
    "pg",
    "pg-pool",
    "pg-connection-string",
    "pgpass",
    "split2",
    "zlib-sync",
    "bufferutil",
    "utf-8-validate",
  ],
  typescript: {
    ignoreBuildErrors: process.env.NEXT_IGNORE_TYPE_ERRORS === "1",
  },
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
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
      "zlib-sync": "./lib/shims/empty-client-module.js",
      bufferutil: "./lib/shims/empty-client-module.js",
      "utf-8-validate": "./lib/shims/empty-client-module.js",
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && process.env.INACCORD_DESKTOP_RUNTIME === "1") {
      config.cache = false;
    } else if (dev) {
      config.cache = {
        type: "memory",
      };
    }

    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(({ request }, callback) => {
        if (request && serverOnlyExternalPackages.has(request)) {
          return callback(null, `commonjs ${request}`);
        }

        return callback();
      });
    }

    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
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
