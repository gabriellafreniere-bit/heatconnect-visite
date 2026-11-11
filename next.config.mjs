/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [
    { source: "/(.*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Referrer-Policy", value: "same-origin" }] },
  ],
};
export default nextConfig;
