import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// `next dev`에서도 wrangler.jsonc의 바인딩(D1 등)을 쓸 수 있게 한다.
// 이게 없으면 개발 서버에서 getCloudflareContext()의 env가 비어 있다.
initOpenNextCloudflareForDev();
