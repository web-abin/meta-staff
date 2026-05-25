import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next.js 16 默认禁止跨源访问 /_next/* dev 资源（含 webpack-hmr WS）。
  // 部署到服务器后从公网 IP / 域名访问时，必须把这些来源加入白名单，
  // 否则 HMR WS 连不上 → 客户端不 hydrate → 整页"什么都点不动"。
  // 通过 NEXT_DEV_ALLOWED_ORIGINS 注入（逗号分隔），缺省至少放公网 IP。
  allowedDevOrigins: (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "49.233.191.112")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
