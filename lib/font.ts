// Pretendard 가변 폰트를 자체 호스팅 — 외부 CDN 의존 제거
import localFont from 'next/font/local';

export const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
});
