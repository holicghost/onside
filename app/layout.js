import "./globals.css";

export const metadata = {
  title: "오버워치 내전 경매",
  description: "오버워치 내전 경매 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        {/* Pretendard 폰트: @import url()이 Turbopack에서 지원되지 않아 link 태그로 직접 로드 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body
        suppressHydrationWarning={true}
        className="min-h-full flex flex-col"
        style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", backgroundColor: '#0f0f1a', color: '#f0f0f0' }}
      >
        {children}
      </body>
    </html>
  );
}
