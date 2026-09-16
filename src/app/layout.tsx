import type { Metadata } from "next";
import { themes, defaultTheme } from "@/themes";
import "./globals.css";
export const metadata: Metadata = {
  title: "Estate Organiser",
  description: "A shared space for taking care of what comes next.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={themes[defaultTheme].className}>
      <body>{children}</body>
    </html>
  );
}
