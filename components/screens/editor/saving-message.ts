// isServerEvent가 아니면 patchEvent가 서버로 아무것도 안 보낸다(StudioProvider.tsx) — 그때
// "저장 중"이라고 말하면 거짓이다(FE-36). isServerEvent라도 필드 변경 직후 "반영됨"류
// 문구를 먼저 찍으면 700ms 뒤 flushServerSave가 "변경 저장 중…"으로 덮어써 순서가
// 뒤집힌다(FE-38, /code-review가 ThemeSection에서 재발 지적) — 저장 여부를 알리는 문구는
// 항상 이 한 판정으로 고른다. 호출부마다 따로 적으면 이번처럼 일부 자리를 빠뜨리기 쉽다.
export function savingMessage(isServerEvent: boolean): string {
  return isServerEvent ? '변경 저장 중…' : '미리보기에만 반영됨';
}
