import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { themes, defaultTheme } from "@/themes";
import "./globals.css";
const palette = themes[defaultTheme];
export const metadata: Metadata = {
  title: "Estate Organiser",
  description: "A shared space for taking care of what comes next.",
  applicationName: "Estate Organiser",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Estate",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: palette.colors.primary,
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={themes[defaultTheme].className}>
      <body>
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function() {}); }",
          }}
        />
        {children}
      </body>
    </html>
  );
}
