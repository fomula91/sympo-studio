import { BadRequest } from './db';

// 브랜드 프리셋 저장·조회 (BE-20).
//
// `brand_presets`는 0001 스키마에 처음부터 있었지만 **쓰기 경로가 없어 내내
// 비어 있었다.** 그래서 `events.preset_id`(FK)를 설정하려는 PATCH가 FK 위반으로
// 500이 났고, 공개 응답이 프리셋 색을 못 돌려주는 것도 그 결과였다.
//
// 프리셋을 코드 상수가 아니라 테이블로 둔 이유는 [[0005-d1-schema]]에 있다:
// 실무에서 넘어오는 건 색상 값이 아니라 **이미지**라, 추출한 색이 회차를 넘어
// 쌓여야 한다(FE-8). 그래서 빌트인 5종과 추출본이 같은 테이블에 살고
// `origin`으로만 갈린다.

export interface PresetRow {
  id: string;
  label: string;
  hue: number;
  chroma: number;
  origin: string;
  source_key: string | null;
}

export function toPresetDTO(row: PresetRow) {
  return {
    id: row.id,
    label: row.label,
    // 화면(lib/theme.ts의 derive)이 쓰는 이름은 h·c다 — DTO에서 맞춰 내보내
    // 클라이언트가 매번 이름을 바꿔 담지 않게 한다.
    h: row.hue,
    c: row.chroma,
    origin: row.origin,
  };
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ORIGINS = ['builtin', 'extracted'];

export interface PresetInput {
  id: string;
  label: string;
  hue: number;
  chroma: number;
  origin: string;
  sourceKey: string | null;
}

/** POST /api/presets 본문 검증. hue·chroma 범위는 OKLCH가 실제로 받는 값이다. */
export function validatePresetBody(raw: unknown): PresetInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.id !== 'string' || !ID_PATTERN.test(o.id)) {
    throw new BadRequest('id는 소문자·숫자·하이픈 40자 이내여야 합니다.');
  }
  if (typeof o.label !== 'string' || !o.label.trim() || o.label.length > 60) {
    throw new BadRequest('label은 1~60자여야 합니다.');
  }
  // hue는 색상환이라 0~360, chroma는 OKLCH에서 0.4를 넘으면 sRGB 밖이라
  // 어차피 감이 클램핑된다(FE-7의 대비비 게이트가 그 값으로 판정한다).
  if (typeof o.hue !== 'number' || !Number.isFinite(o.hue) || o.hue < 0 || o.hue >= 360) {
    throw new BadRequest('hue는 0 이상 360 미만이어야 합니다.');
  }
  if (typeof o.chroma !== 'number' || !Number.isFinite(o.chroma) || o.chroma < 0 || o.chroma > 0.4) {
    throw new BadRequest('chroma는 0 이상 0.4 이하여야 합니다.');
  }

  const origin = typeof o.origin === 'string' ? o.origin : 'extracted';
  if (!ORIGINS.includes(origin)) {
    throw new BadRequest(`origin은 ${ORIGINS.join('|')} 중 하나여야 합니다.`);
  }
  const sourceKey = o.sourceKey === undefined || o.sourceKey === null ? null : o.sourceKey;
  if (sourceKey !== null && (typeof sourceKey !== 'string' || sourceKey.length > 300)) {
    throw new BadRequest('sourceKey는 300자 이하 문자열이어야 합니다.');
  }

  return { id: o.id, label: o.label.trim(), hue: o.hue, chroma: o.chroma, origin, sourceKey };
}
