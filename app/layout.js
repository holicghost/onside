import "./globals.css";

export const metadata = {
  title: "도현 배 유인원 컵",
  description: "RØDE와 함께하는 도현 배 유인원 컵 팀원 선발 경매 홈페이지",
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
        <div className="flex-1">{children}</div>
        <footer className="py-4 text-center text-gray-600" style={{ fontSize: '14px' }}>
          © 2026 ONSIDE. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
