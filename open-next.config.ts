import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 캐시 오버라이드는 배포(BE-2)에서 KV를 붙일 때 채운다.
// 지금은 D1 + Route Handler만 필요하므로 기본값으로 둔다.
export default defineCloudflareConfig({});
