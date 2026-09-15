import type { NextRequest } from 'next/server';
import { ApiError, BadRequest, getDb, json, withRoute } from '@/lib/db';
import { requireUser, sessionTokenHash, sessionUserIdSql } from '@/lib/auth';
import { toPresetDTO, validatePresetBody, type PresetRow } from '@/lib/presets';

/**
 * GET /api/presets — 프리셋 목록 (BE-20, BE-25)
 *
 * 빌트인 5종과 추출본(FE-8)이 같은 테이블에 산다 — `origin`으로만 갈린다.
 * 프리셋이 "미리 준비된 목록"이 아니라 **쌓이는 것**이어야 한다는 게 이 설계의
 * 요점이다([[0005-d1-schema]]): 실무에서 넘어오는 건 색상 값이 아니라 이미지다.
 *
 * **보이는 범위는 소유권으로 갈린다** (BE-25). `owner_id IS NULL`이 공용(내장)이고,
 * 나머지는 만든 사람에게만 보인다 — 남이 쌓은 브랜드 색 목록은 그 사람의 것이다.
 * 판정을 같은 문에 넣어 왕복을 늘리지 않는다(BE-13 ⑥과 같은 수법).
 *
 * 캐시를 `public`에서 **`private`로 내렸다** — 응답이 보는 사람에 따라 달라지므로
 * 공유 캐시에 올리면 한 사람의 목록이 다른 사람에게 갈 수 있다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const tokenHash = await sessionTokenHash(request);
  const { results } = await db
    .prepare(
      `SELECT id, label, hue, chroma, origin, source_key FROM brand_presets
        WHERE owner_id IS NULL OR owner_id = ${sessionUserIdSql(1)}
        ORDER BY origin, id`,
    )
    .bind(tokenHash)
    .all<PresetRow>();
  return json({ presets: results.map(toPresetDTO) }, 200, {
    'Cache-Control': 'private, max-age=30',
    // `private`만으로는 **브라우저 자신의 캐시**를 못 막는다 — URL로만 키를 잡으므로
    // 게스트로 받은 목록이 로그인 후에도 30초 동안 그대로 나온다(`/code-review` 발견).
    Vary: 'Cookie',
  });
});

/**
 * POST /api/presets — 프리셋 저장(업서트) (BE-20, BE-25)
 *
 * FE-8이 대표 이미지에서 뽑은 색을 여기로 올려야 **다음 회차에서 다시 쓸 수 있고**,
 * 그래야 `events.preset_id`가 그 프리셋을 가리킬 수 있다.
 *
 * 같은 id를 다시 올리면 덮어쓴다 — 추출은 이미지가 조금만 달라도 값이 흔들리는데,
 * 회차마다 새 id를 만들면 목록이 사실상 같은 브랜드로 가득 찬다.
 *
 * ## 세 가지를 잠갔다 (BE-25)
 *
 * 예전에는 **인증 호출이 0건**이었고 `ON CONFLICT(id) DO UPDATE`가 조건 없이 돌아,
 * **id만 알면 남이 만든 프리셋을(내장 5종까지) 아무나 덮어썼다.** 프리셋 색은 참가자
 * 화면에 그대로 렌더되므로 그건 곧 **남의 행사 페이지 색을 바꾸는 것**이다.
 *
 * 1. **로그인 필수**(401) — 소유자를 정하지 못하면 잠글 대상도 없다.
 * 2. **내장 프리셋 수정 금지** — `origin`을 본문에서 받지 않고 `'extracted'`로 고정한다.
 *    내장은 마이그레이션(0006)으로만 생긴다. 받아서 검사하는 대신 **받지 않는 쪽**을
 *    골랐다(BE-27과 같은 판단 — 검사는 잊을 수 있지만 없는 입력은 잊을 수 없다).
 * 3. **남의 것 덮어쓰기 금지** — `DO UPDATE`에 `WHERE owner_id = 나`를 단다. 조건이
 *    맞지 않으면 갱신도 오류도 없이 **아무 행도 안 돌아오므로** 그걸로 409를 낸다.
 *
 * **409로 존재를 알려 주는 것이 여기서는 맞다.** 다른 운영자 경로는 404로 존재를
 * 숨기지만, 프리셋 id는 사용자가 라벨에서 파생시키는 **공유 이름공간**이라
 * (`meridian` 같은 값) 충돌을 숨기면 FE가 다른 id를 고를 수 없다 — 아이디 중복과
 * 같은 성격이다. 이름공간을 계정별로 가르려면 PK를 바꿔야 하는데(테이블 재작성)
 * 그건 이 과제의 위험 범위를 넘는다.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const owner = await requireUser(db, request);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const p = validatePresetBody(raw);

  const row = await db
    .prepare(
      `INSERT INTO brand_presets (id, label, hue, chroma, origin, source_key, owner_id)
       VALUES (?, ?, ?, ?, 'extracted', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label, hue = excluded.hue, chroma = excluded.chroma,
         source_key = excluded.source_key
         WHERE brand_presets.owner_id = excluded.owner_id
       RETURNING id, label, hue, chroma, origin, source_key`,
    )
    .bind(p.id, p.label, p.hue, p.chroma, p.sourceKey, owner.id)
    .first<PresetRow>();

  // 갱신 조건에 걸렸다 = 이 id는 내장이거나 남의 것이다.
  if (!row) {
    throw new ApiError('이미 사용 중인 프리셋 id입니다. 다른 이름으로 저장해 주세요.', 409);
  }
  return json(toPresetDTO(row), 201);
});
