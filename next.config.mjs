/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Prisma must not be bundled into server components.
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  async headers() {
    return [
      {
        // AudioWorklet modules must be served same-origin with a JS mime type.
        source: "/worklets/:path*",
        headers: [{ key: "Content-Type", value: "application/javascript" }],
      },
    ];
  },
};
export default nextConfig;
