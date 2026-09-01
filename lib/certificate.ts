// pdf-lib로 브라우저에서 수료증 PDF를 생성·다운로드하는 유틸 (FE-4, 서버 PDF 생성은 무료 티어에서 막혀 클라이언트 생성이 전제)
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

export interface CertificateInfo {
  eventTitle: string;
  venue: string;
  date: string;
  participantName?: string;
}

const PAGE_WIDTH = 842; // A4 가로(landscape), pt
const PAGE_HEIGHT = 595;

function centerX(text: string, size: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>): number {
  return PAGE_WIDTH / 2 - font.widthOfTextAtSize(text, size) / 2;
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

  const title = '수료증';
  page.drawText(title, { x: centerX(title, 40, font), y: 430, size: 40, font, color: brand });

  const name = `${info.participantName?.trim() || '참가자'} 님`;
  page.drawText(name, { x: centerX(name, 24, font), y: 350, size: 24, font, color: ink });

  const bodyLine1 = `위 사람은 ${info.date} ${info.venue}에서 열린`;
  page.drawText(bodyLine1, { x: centerX(bodyLine1, 14, font), y: 300, size: 14, font, color: ink });

  const eventLine = `"${info.eventTitle}"`;
  page.drawText(eventLine, { x: centerX(eventLine, 16, font), y: 274, size: 16, font, color: brand });

  const bodyLine2 = '에 참여하여 설문을 완료했음을 증명합니다.';
  page.drawText(bodyLine2, { x: centerX(bodyLine2, 14, font), y: 248, size: 14, font, color: ink });

  const footer = 'SYMPO STUDIO';
  page.drawText(footer, { x: centerX(footer, 11, font), y: 60, size: 11, font, color: rgb(0.55, 0.55, 0.58) });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `수료증-${info.eventTitle}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
