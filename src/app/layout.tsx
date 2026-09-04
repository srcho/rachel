import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/core/ui/PwaProvider";
import { ThemeProvider } from "@/core/ui/ThemeProvider";
import { Toaster } from "@/core/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rachel", template: "%s · Rachel" },
  description: "할 일·일정·회의를 기억하고 대신 움직여 주는 개인 비서",
  applicationName: "Rachel",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rachel" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // 포커스·다이얼로그·드로어 전환에 화면이 확대되지 않게(iOS 는 입력 포커스 때 자동 확대하고 그 배율이 남는다)
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {/* 테마(class) · 서비스 워커 등록 · 토스트. 스캐폴드부터 import 만 되고 마운트가 빠져 있었다(2026-09-04 발견) */}
        <ThemeProvider>
          <PwaProvider>
            {children}
            <Toaster />
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
