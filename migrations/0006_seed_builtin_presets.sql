-- 0006_seed_builtin_presets — 빌트인 브랜드 프리셋 5종 (BE-20)
--
-- `brand_presets`는 0001부터 있었지만 **한 번도 채워진 적이 없다.** 그래서
-- `events.preset_id`(이 테이블을 참조하는 FK)를 설정하려는 PATCH가 전부 FK
-- 위반으로 500이 났고, 참가자 공개 응답이 프리셋 색을 못 돌려주는 것도 그
-- 결과였다 — 애초에 가리킬 행이 없었다.
--
-- **시드(lib/seed.ts)가 아니라 마이그레이션에 두는 이유**: 빌트인 5종은 데모
-- 데이터가 아니라 참조 데이터다. 시드는 매일 자정 `DELETE FROM events`로 데모를
-- 갈아엎는데, 그때 프리셋까지 사라지면 그 순간 공개돼 있던 행사의 preset_id가
-- ON DELETE SET NULL로 조용히 끊긴다.
--
-- 값은 lib/theme.ts의 PRESETS와 같아야 한다 — 한쪽만 고치면 서버가 돌려주는
-- 색과 빌트인 폴백 색이 갈린다.

INSERT INTO brand_presets (id, label, hue, chroma, origin) VALUES
  ('slate',  '슬레이트 뉴트럴', 255, 0.028, 'builtin'),
  ('aurora', 'AURORA 그린',    158, 0.105, 'builtin'),
  ('prime',  'PRIME 블루',     252, 0.125, 'builtin'),
  ('vertex', 'VERTEX 퍼플',    305, 0.115, 'builtin'),
  ('amber',  'HERO 앰버',       72, 0.115, 'builtin')
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label, hue = excluded.hue, chroma = excluded.chroma;
