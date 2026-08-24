// .open-next/worker.js는 `opennextjs-cloudflare build`의 산출물이라 fresh clone에는
// 없다. 이 앰비언트 선언이 있으면 tsc가 산출물 유무와 무관하게 같은 결과를 낸다
// (산출물이 있으면 실제 파일이, 없으면 이 선언이 잡힌다 — @ts-expect-error처럼
// 한쪽에서만 유효해지는 지시문을 피한다).
declare module '*.open-next/worker.js' {
  const handler: ExportedHandler<CloudflareEnv>;
  export default handler;
  // Durable Object 클래스들 — 런타임 재-export용이라 타입은 중요하지 않다.
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
