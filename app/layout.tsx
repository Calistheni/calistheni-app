import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/navigation/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NativeShell } from "@/components/native/NativeShell";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/site-url";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Calistheni",
  title: {
    default: "Calistheni | Worldwide Calisthenics Park Finder",
    template: "%s | Calistheni",
  },
  description:
    "Find calisthenics parks around the world with location-aware map browsing, park details, and equipment information.",
  keywords: [
    "calisthenics parks",
    "street workout parks",
    "outdoor gyms",
    "fitness map",
    "bodyweight training",
  ],
  openGraph: {
    type: "website",
    siteName: "Calistheni",
    title: "Calistheni | Worldwide Calisthenics Park Finder",
    description:
      "Browse calisthenics parks worldwide, explore equipment, and discover places to train outdoors.",
    images: [
      {
        url: "/icons/icon.png",
        width: 600,
        height: 600,
        alt: "Calistheni icon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Calistheni | Worldwide Calisthenics Park Finder",
    description:
      "Discover calisthenics parks worldwide and find your next outdoor training spot.",
    images: ["/icons/icon.png"],
  },
  icons: {
    icon: [{ url: "/icons/icon.png", type: "image/png" }],
    apple: "/icons/icon.png",
    shortcut: "/icons/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NativeShell />
          <AppShell
            user={
              session?.user
                ? { name: session.user.name, email: session.user.email }
                : null
            }
          >
            {children}
          </AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
