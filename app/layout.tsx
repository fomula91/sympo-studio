import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SYMPO STUDIO',
  description: '심포지엄 마이크로사이트를 만들고 운영하는 스튜디오',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // data-theme은 페인트 전 스크립트가 붙인다 — 서버 HTML과 항상 다를 수 있는 의도된 불일치
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 다크모드 깜빡임 방지 — 페인트 전에 저장된 테마를 <html>에 반영한다 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('sympo-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}",
          }}
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
