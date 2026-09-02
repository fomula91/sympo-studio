// pdf-lib로 브라우저에서 수료증 PDF를 생성·다운로드하는 유틸 (FE-4, 서버 PDF 생성은 무료 티어에서 막혀 클라이언트 생성이 전제)
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';

export interface CertificateInfo {
  eventTitle: string;
  venue: string;
  date: string;
  participantName?: string;
}

const PAGE_WIDTH = 842; // A4 가로(landscape), pt
const PAGE_HEIGHT = 595;
const MAX_LINE_WIDTH = PAGE_WIDTH - 160; // 좌우 여백을 넉넉히 둔다
const RESERVED_FILENAME_CHARS = /[\\/:*?"<>|]/g;

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
): void {
  const { text, size } = fitLine(rawText, desiredSize, minSize, font);
  const x = PAGE_WIDTH / 2 - font.widthOfTextAtSize(text, size) / 2;
  page.drawText(text, { x, y, size, font, color });
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
  const fontBytes = await fetch('/fonts/PretendardVariable.woff2').then((res) => res.arrayBuffer());

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // subset:true는 Pretendard(가변 폰트, 글리프 수가 많음)에서 fontkit 서브셋터가 깨진다 — 전체 임베드로 우회.
  const font = await pdfDoc.embedFont(fontBytes);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ink = rgb(0.16, 0.16, 0.19);
  const brand = rgb(0.13, 0.3, 0.34);
  const line = rgb(0.85, 0.85, 0.87);

  page.drawRectangle({
    x: 28,
    y: 28,
    width: PAGE_WIDTH - 56,
    height: PAGE_HEIGHT - 56,
    borderColor: line,
    borderWidth: 1.5,
  });

  drawFittedLine(page, '수료증', 430, 40, 28, font, brand);
  drawFittedLine(page, `${info.participantName?.trim() || '참가자'} 님`, 350, 24, 14, font, ink);
  drawFittedLine(page, `위 사람은 ${info.date} ${info.venue}에서 열린`, 300, 14, 9, font, ink);
  drawFittedLine(page, `"${info.eventTitle}"`, 274, 16, 10, font, brand);
  drawFittedLine(page, '에 참여하여 설문을 완료했음을 증명합니다.', 248, 14, 9, font, ink);
  drawFittedLine(page, 'SYMPO STUDIO', 60, 11, 8, font, rgb(0.55, 0.55, 0.58));

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
