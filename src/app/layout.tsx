import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

const mPlusRounded = M_PLUS_Rounded_1c({
  weight: ['400', '700'],
  subsets: ["latin"],
  variable: "--font-m-plus-rounded",
});

export const metadata: Metadata = {
  title: "QRコードスキャナー",
  description: "QRコードをスキャンするWebアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className={`${mPlusRounded.variable} font-sans antialiased h-full`}>
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
