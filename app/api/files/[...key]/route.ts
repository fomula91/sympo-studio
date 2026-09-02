import type { NextRequest } from 'next/server';
import { getEnv, json, withRoute } from '@/lib/db';
import { getUrlSecret, verifyDocumentUrl } from '@/lib/r2';

type KeyCtx = { params: Promise<{ key: string[] }> };

/**
 * GET /api/files/[...key]?exp=&sig= — 서명 URL로 자료 받기 (BE-6)
 *
 * 서명·만료를 검증하고 R2 객체를 **스트림 그대로** 흘린다. 본문을 메모리에 모으지
 * 않으므로 파일이 커도 서버 CPU·메모리가 늘지 않는다(ADR 0002).
 *
 * 검증 실패는 사유를 가리지 않고 전부 404다 — 서명이 틀렸는지, 만료됐는지,
 * 키가 없는지를 구분해 주면 그 자체가 탐색 도구가 된다(BE-7의 "존재를 흘리지
 * 않는다"와 같은 규칙).
 *
 * 캐시는 `private`다. 서명 URL이 곧 접근 권한이라 공유 캐시(엣지·프록시)가
 * 응답을 들고 있으면 만료된 서명으로도 받을 수 있게 된다.
 */
export const GET = withRoute(async (request: NextRequest, ctx: KeyCtx) => {
  const { key: segments } = await ctx.params;
  const key = segments.join('/');
  const env = await getEnv();
  const sp = request.nextUrl.searchParams;

  await verifyDocumentUrl(getUrlSecret(env), key, sp.get('exp'), sp.get('sig'));

  const object = await env.DOCS.get(key);
  if (!object) return json({ error: '파일을 찾을 수 없습니다.' }, 404);

  // R2의 writeHttpMetadata(headers)를 쓰지 않는다 — `next dev`의 바인딩 프록시가
  // Headers 객체를 RPC 경계 너머로 직렬화하지 못해 터진다
  // (`DevalueError: Cannot stringify arbitrary non-POJOs`, 로컬 실측).
  // 필요한 것은 두 개뿐이라 직접 조립하는 편이 어댑터 마찰도 없고 명시적이다.
  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('etag', object.httpEtag);
  headers.set('content-length', String(object.size));
  // 서명이 살아 있는 동안만 브라우저가 재사용하게 한다.
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(object.body, { headers });
});
