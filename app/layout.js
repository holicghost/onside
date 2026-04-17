import "./globals.css";
import MusicPlayer from "./components/MusicPlayer";

export const metadata = {
  title: "RØDE와 함께하는 도현컵",
  description: "By. ONSIDE COMPANY",
  icons: {
    icon: '/logo.png',
  },
  openGraph: {
    title: "RØDE와 함께하는 도현컵",
    description: "By. ONSIDE COMPANY",
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
      }
    ],
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f0f1a" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});` }} />
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
