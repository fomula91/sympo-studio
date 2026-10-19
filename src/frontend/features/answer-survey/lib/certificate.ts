// pdf-lib로 브라우저에서 수료증 PDF를 생성·다운로드하는 유틸 (FE-4, 서버 PDF 생성은 무료 티어에서 막혀 클라이언트 생성이 전제)
// 상장 느낌의 이중 테두리·코너 장식·직인을 추가했다(사용자 요청, 이슈 #75) — 벡터 도형만
// 써서(이미지 에셋 없음) pdf-lib 기본 API로 그린다.
import fontkit from '@pdf-lib/fontkit';
import { degrees, PDFDocument, rgb, type PDFFont } from 'pdf-lib';

export interface CertificateInfo {
  eventTitle: string;
  venue: string;
  date: string;
  participantName?: string;
}

const PAGE_WIDTH = 842; // A4 가로(landscape), pt
const PAGE_HEIGHT = 595;
const MAX_LINE_WIDTH = PAGE_WIDTH - 200; // 이중 테두리 안쪽에 맞춰 여백을 더 둔다
const RESERVED_FILENAME_CHARS = /[\\/:*?"<>|]/g;

// 테두리·장식 색은 본문 잉크와 분리한다 — 금색(gold)은 직인·코너 장식·제목 밑줄에만 쓰고
// 본문 글자색(ink·brand)은 그대로 둬 가독성을 지킨다.
const INK = rgb(0.16, 0.16, 0.19);
const BRAND = rgb(0.13, 0.3, 0.34);
const GOLD = rgb(0.68, 0.53, 0.22);
const LINE_GRAY = rgb(0.85, 0.85, 0.87);
const MUTED = rgb(0.55, 0.55, 0.58);
const PAPER = rgb(0.992, 0.986, 0.97); // 순백 대신 아주 옅은 아이보리 — 바탕이 비어 보이지 않게 한다

/** 지정한 너비 안에 들어올 때까지 폰트 크기를 줄이고, 그래도 안 들어오면 말줄임표로 자른다. */
function fitLine(text: string, desiredSize: number, minSize: number, font: PDFFont): { text: string; size: number } {
  let size = desiredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > MAX_LINE_WIDTH) size -= 1;
  if (font.widthOfTextAtSize(text, size) <= MAX_LINE_WIDTH) return { text, size };

  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > MAX_LINE_WIDTH) {
    truncated = truncated.slice(0, -1);
  }
  return { text: `${truncated}…`, size };
}

function drawFittedLine(
  page: Awaited<ReturnType<PDFDocument['addPage']>>,
  rawText: string,
  y: number,
  desiredSize: number,
  minSize: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
): { width: number; size: number } {
  const { text, size } = fitLine(rawText, desiredSize, minSize, font);
  const width = font.widthOfTextAtSize(text, size);
  const x = PAGE_WIDTH / 2 - width / 2;
  page.drawText(text, { x, y, size, font, color });
  return { width, size };
}

/** "YYYY-MM-DD" → "YYYY년 M월 D일". 형식이 다르면(깨진 게스트 데이터 등) 원문을 그대로 돌려준다. */
function formatKoreanDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

// 안쪽 테두리 네 모서리에 L자 금색 코너 장식을 그린다 — 상장류 디자인의 흔한 모티프.
// dirX·dirY는 모서리에서 안쪽으로 향하는 방향(+1/-1)이다.
function drawCornerOrnament(
  page: Awaited<ReturnType<PDFDocument['addPage']>>,
  x: number,
  y: number,
  armLength: number,
  dirX: 1 | -1,
  dirY: 1 | -1,
): void {
  page.drawLine({ start: { x, y }, end: { x: x + armLength * dirX, y }, thickness: 1.4, color: GOLD });
  page.drawLine({ start: { x, y }, end: { x, y: y + armLength * dirY }, thickness: 1.4, color: GOLD });
  page.drawCircle({ x, y, size: 2.2, color: GOLD });
}

// 제목 좌우에 다는 작은 금색 다이아몬드 장식(◆) — 45도 회전한 정사각형.
// drawRectangle의 회전은 (x,y)를 축으로 돈다(중심이 아니다) — 45도 회전한 정사각형의
// 시각적 중심은 축에서 수직으로 size/√2만큼 위에 생기므로, 그만큼 y를 내려 보정한다.
function drawDiamond(page: Awaited<ReturnType<PDFDocument['addPage']>>, cx: number, cy: number, size: number): void {
  page.drawRectangle({
    x: cx,
    y: cy - size / Math.SQRT2,
    width: size,
    height: size,
    color: GOLD,
    rotate: degrees(45),
  });
}

// 발급 직인 — 이미지 대신 벡터 이중 원 + 안쪽 2줄 글자로 "도장" 느낌을 낸다.
function drawSeal(page: Awaited<ReturnType<PDFDocument['addPage']>>, cx: number, cy: number, font: PDFFont): void {
  page.drawCircle({ x: cx, y: cy, size: 32, borderColor: BRAND, borderWidth: 1.8 });
  page.drawCircle({ x: cx, y: cy, size: 27, borderColor: GOLD, borderWidth: 1 });
  page.drawCircle({ x: cx, y: cy, size: 25, color: GOLD, opacity: 0.08 });

  const top = 'SYMPO';
  const topSize = 11;
  const topWidth = font.widthOfTextAtSize(top, topSize);
  page.drawText(top, { x: cx - topWidth / 2, y: cy + 3, size: topSize, font, color: GOLD });

  page.drawLine({ start: { x: cx - 14, y: cy - 3 }, end: { x: cx + 14, y: cy - 3 }, thickness: 0.6, color: GOLD });

  const bottom = 'STUDIO';
  const bottomSize = 7;
  const bottomWidth = font.widthOfTextAtSize(bottom, bottomSize);
  page.drawText(bottom, { x: cx - bottomWidth / 2, y: cy - 13, size: bottomSize, font, color: GOLD });
}

/** Windows 파일 시스템 예약 문자(\ / : * ? " < > |)를 지우고 길이를 제한한다. */
function sanitizeFilenamePart(name: string): string {
  const cleaned = name.replace(RESERVED_FILENAME_CHARS, '').trim();
  const base = cleaned || 'event';
  // .slice(0, 60)은 UTF-16 코드 유닛 기준이라 서로게이트 쌍(이모지 등)을 반으로
  // 잘라 깨진 문자를 남길 수 있다 — 코드 포인트 단위로 스프레드해 자른다.
  const codePoints = Array.from(base);
  return codePoints.length > 60 ? codePoints.slice(0, 60).join('') : base;
}

export async function generateCertificate(info: CertificateInfo): Promise<void> {
  // 앱 UI 폰트는 Pretendard지만, 수료증은 다른 폰트(Gothic A1, OFL)를 쓴다 — 가변 폰트
  // (PretendardVariable.woff2)도, 고정 폭 CFF(Pretendard-Regular.otf)도 fontkit 임베딩에서
  // 한글 복합 글리프가 깨졌다(전자는 빈 윤곽선, 후자는 CID-keyed CFF 파싱에서 예외 발생).
  // 실제 브라우저에서 "수료증" 제목·이름 모두 안 보이는 것으로 재현·확인했다. 구조가 단순한
  // TrueType 한글 폰트로 바꾸니 바로 해결돼, 수료증 PDF 전용으로 이 폰트를 쓴다.
  const [regularBytes, boldBytes] = await Promise.all([
    fetch('/fonts/GothicA1-Regular.ttf').then((res) => res.arrayBuffer()),
    fetch('/fonts/GothicA1-Bold.ttf').then((res) => res.arrayBuffer()),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(regularBytes);
  const bold = await pdfDoc.embedFont(boldBytes);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // 순백 대신 아주 옅은 아이보리 바탕 — 안쪽 테두리 범위만 채워서 비어 보이지 않게 한다.
  const outerInset = 28;
  const innerInset = 46;
  page.drawRectangle({
    x: innerInset,
    y: innerInset,
    width: PAGE_WIDTH - innerInset * 2,
    height: PAGE_HEIGHT - innerInset * 2,
    color: PAPER,
  });

  // 삼중 테두리 — 바깥은 가는 회색 선, 그 안쪽은 금색 두 줄(굵은 선 + 가는 선)로
  // 상장류에서 흔한 "이중 금선" 액자를 만든다.
  page.drawRectangle({
    x: outerInset,
    y: outerInset,
    width: PAGE_WIDTH - outerInset * 2,
    height: PAGE_HEIGHT - outerInset * 2,
    borderColor: LINE_GRAY,
    borderWidth: 1.5,
  });
  page.drawRectangle({
    x: innerInset,
    y: innerInset,
    width: PAGE_WIDTH - innerInset * 2,
    height: PAGE_HEIGHT - innerInset * 2,
    borderColor: GOLD,
    borderWidth: 2,
  });
  const hairlineInset = innerInset + 6;
  page.drawRectangle({
    x: hairlineInset,
    y: hairlineInset,
    width: PAGE_WIDTH - hairlineInset * 2,
    height: PAGE_HEIGHT - hairlineInset * 2,
    borderColor: GOLD,
    borderWidth: 0.6,
  });

  // 안쪽 테두리 네 모서리 코너 장식.
  const armLength = 22;
  drawCornerOrnament(page, innerInset, innerInset, armLength, 1, 1);
  drawCornerOrnament(page, PAGE_WIDTH - innerInset, innerInset, armLength, -1, 1);
  drawCornerOrnament(page, innerInset, PAGE_HEIGHT - innerInset, armLength, 1, -1);
  drawCornerOrnament(page, PAGE_WIDTH - innerInset, PAGE_HEIGHT - innerInset, armLength, -1, -1);

  // 상단 — 발급 기관 안내 문구 + 영문 부제 + 제목(볼드) + 제목 양옆 다이아몬드 + 밑줄.
  drawFittedLine(page, 'SYMPO STUDIO', 482, 11, 8, font, MUTED);
  const { width: titleWidth } = drawFittedLine(page, '수료증', 428, 42, 28, bold, BRAND);
  drawDiamond(page, PAGE_WIDTH / 2 - titleWidth / 2 - 22, 449, 7);
  drawDiamond(page, PAGE_WIDTH / 2 + titleWidth / 2 + 22, 449, 7);
  drawFittedLine(page, 'CERTIFICATE OF COMPLETION', 404, 9.5, 7, font, MUTED);
  page.drawRectangle({ x: PAGE_WIDTH / 2 - 45, y: 392, width: 90, height: 2, color: GOLD });

  // 본문 — 참가자 이름(볼드)만 밑줄로 "채워 넣은 칸" 느낌을 낸다.
  const { width: nameWidth, size: nameSize } = drawFittedLine(
    page,
    `${info.participantName?.trim() || '참가자'} 님`,
    340,
    24,
    14,
    bold,
    INK,
  );
  page.drawLine({
    start: { x: PAGE_WIDTH / 2 - nameWidth / 2 - 18, y: 340 - nameSize * 0.28 },
    end: { x: PAGE_WIDTH / 2 + nameWidth / 2 + 18, y: 340 - nameSize * 0.28 },
    thickness: 1,
    color: GOLD,
  });

  drawFittedLine(page, `위 사람은 ${formatKoreanDate(info.date)} ${info.venue}에서 열린`, 290, 14, 9, font, INK);
  drawFittedLine(page, `"${info.eventTitle}"`, 264, 16, 10, bold, BRAND);
  drawFittedLine(page, '에 참여하여 설문을 완료했음을 증명합니다.', 238, 14, 9, font, INK);

  // 하단 — 왼쪽 발급일 / 오른쪽 직인 + 서명란. 발급일은 직인과 대칭을 이루도록 왼쪽
  // 여백에 맞춰 둔다 — drawFittedLine은 항상 페이지 중앙 정렬이라 왼쪽 배치엔 못 쓴다.
  const bottomY = 100;
  page.drawText(`발급일  ${formatKoreanDate(info.date)}`, { x: 110, y: bottomY, size: 12, font, color: MUTED });

  const sealX = PAGE_WIDTH - 180;
  drawSeal(page, sealX, bottomY + 10, font);
  page.drawLine({
    start: { x: sealX - 70, y: bottomY - 24 },
    end: { x: sealX + 70, y: bottomY - 24 },
    thickness: 1,
    color: LINE_GRAY,
  });
  const issuerLabel = 'SYMPO STUDIO';
  const issuerSize = 10;
  const issuerWidth = font.widthOfTextAtSize(issuerLabel, issuerSize);
  page.drawText(issuerLabel, { x: sealX - issuerWidth / 2, y: bottomY - 38, size: issuerSize, font, color: MUTED });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `수료증-${sanitizeFilenamePart(info.eventTitle)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
