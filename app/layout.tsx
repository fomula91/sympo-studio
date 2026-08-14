import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SYMPO STUDIO',
  description: '심포지엄 마이크로사이트를 만들고 운영하는 스튜디오',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
