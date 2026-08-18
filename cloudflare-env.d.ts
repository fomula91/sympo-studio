// wrangler는 `wrangler types`로 전역 `Env`를 생성하고(worker-configuration.d.ts),
// @opennextjs/cloudflare의 getCloudflareContext()는 전역 `CloudflareEnv`를 읽는다.
// 둘을 이어주지 않으면 env.DB가 타입 상으로 존재하지 않는다.
declare global {
  // 멤버 없이 확장만 하는 것이 의도다. Env에 바인딩이 추가되면 자동으로 따라온다.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CloudflareEnv extends Env {}
}

export {};
