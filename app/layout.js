import "./globals.css";
import MusicPlayer from "./components/MusicPlayer";

export const metadata = {
  title: "RØDE 유인원 컵 경매",
  description: "By. ONSIDE COMPANY",
  openGraph: {
    title: "RØDE 유인원 컵 경매",
    description: "By. ONSIDE COMPANY",
    images: [
      {
        url: "https://media.discordapp.net/attachments/1421469155227598892/1494037277070852227/805dd936effdaf71.png?ex=69e12624&is=69dfd4a4&hm=a6ffa51914a5c25f2fc085857d5ab7791d65ff5ace3cf048ccb4f5e38c4598d1&=&format=webp&quality=lossless&width=865&height=544",
        width: 865,
        height: 544,
      }
    ],
    type: "website",
  },
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
        <MusicPlayer />
        <div className="flex-1">{children}</div>
        <footer className="py-4 text-center text-gray-600" style={{ fontSize: '14px' }}>
          © 2026 ONSIDE. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
