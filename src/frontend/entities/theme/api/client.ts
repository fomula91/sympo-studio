import { ApiClientError, fetchWithTimeout, readError } from '@fe/shared/api/http';
import type { Preset } from "../model/types";

interface PresetDTO {
  id: string;
  label: string;
  h: number;
  c: number;
  origin: string;
}

/**
 * GET /api/presets — 로그인한 사용자가 볼 수 있는 프리셋(내장 + 본인 추출본, BE-25).
 * 내장 5종은 `lib/theme.ts`의 `PRESETS` 상수로 이미 있으니 `origin: 'extracted'`만
 * 골라 `customPresets`에 합친다(FE-40).
 */
export async function fetchStudioPresets(): Promise<Preset[]> {
  const res = await fetchWithTimeout('/api/presets', { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { presets: PresetDTO[] };
  return data.presets.filter((p) => p.origin === 'extracted').map((p) => ({ id: p.id, label: p.label, h: p.h, c: p.c }));
}

/**
 * POST /api/presets — 이미지에서 추출한 브랜드 프리셋을 실제로 저장한다(FE-40).
 * 로그인 필수(401) — 게스트는 이 함수를 부르지 않고 로컬에만 둔다.
 */
export async function createStudioPreset(input: {
  id: string;
  label: string;
  hue: number;
  chroma: number;
}): Promise<Preset> {
  const res = await fetchWithTimeout('/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, sourceKey: null }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const dto = (await res.json()) as PresetDTO;
  return { id: dto.id, label: dto.label, h: dto.h, c: dto.c };
}
