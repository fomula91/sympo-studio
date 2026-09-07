import type { NextRequest } from 'next/server';
import { BadRequest, getDb, json, withRoute } from '@/lib/db';
import { toPresetDTO, validatePresetBody, type PresetRow } from '@/lib/presets';

/**
 * GET /api/presets — 프리셋 목록 (BE-20)
 *
 * 빌트인 5종과 추출본(FE-8)이 같은 테이블에 산다 — `origin`으로만 갈린다.
 * 프리셋이 "미리 준비된 목록"이 아니라 **쌓이는 것**이어야 한다는 게 이 설계의
 * 요점이다([[0005-d1-schema]]): 실무에서 넘어오는 건 색상 값이 아니라 이미지다.
 *
 * 공개 정보라 짧은 엣지 캐시를 둔다 — 프리셋은 자주 안 바뀐다.
 */
export const GET = withRoute(async () => {
  const db = await getDb();
  const { results } = await db
    .prepare('SELECT id, label, hue, chroma, origin, source_key FROM brand_presets ORDER BY origin, id')
    .all<PresetRow>();
  return json({ presets: results.map(toPresetDTO) }, 200, {
    'Cache-Control': 'public, max-age=30',
  });
});

/**
 * POST /api/presets — 프리셋 저장(업서트)
 *
 * FE-8이 대표 이미지에서 뽑은 색을 여기로 올려야 **다음 회차에서 다시 쓸 수 있고**,
 * 그래야 `events.preset_id`가 그 프리셋을 가리킬 수 있다. 지금까지 이 경로가 없어
 * 테이블이 비어 있었고, 그 탓에 `PATCH /api/events/[id]`에 `presetId`를 넣으면
 * FK 위반으로 500이 났다.
 *
 * 같은 id를 다시 올리면 덮어쓴다 — 추출은 이미지가 조금만 달라도 값이 흔들리는데,
 * 회차마다 새 id를 만들면 목록이 사실상 같은 브랜드로 가득 찬다.
 *
 * **운영자 경로라 아직 인가 검사가 없다**(BE-13에서 얹는다).
 */
export const POST = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const p = validatePresetBody(raw);

  const row = await db
    .prepare(
      `INSERT INTO brand_presets (id, label, hue, chroma, origin, source_key)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label, hue = excluded.hue, chroma = excluded.chroma,
         source_key = excluded.source_key
       RETURNING id, label, hue, chroma, origin, source_key`,
    )
    .bind(p.id, p.label, p.hue, p.chroma, p.origin, p.sourceKey)
    .first<PresetRow>();

  if (!row) throw new Error('프리셋 저장 후 행을 돌려받지 못했습니다.');
  return json(toPresetDTO(row), 201);
});
