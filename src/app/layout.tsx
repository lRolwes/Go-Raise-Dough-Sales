import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRD Sales",
  description: "Go Raise Dough prospects, activity and follow-ups",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
