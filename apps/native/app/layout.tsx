import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NativeAppShell } from "@native/components/NativeAppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calistheni Native",
  description: "Locally bundled Calistheni native application shell.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function NativeRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NativeAppShell>{children}</NativeAppShell>
      </body>
    </html>
  );
}
