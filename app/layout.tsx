import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/navigation/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NativeShell } from "@/components/native/NativeShell";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { parseTheme, THEME_COOKIE_NAME } from "@/lib/theme";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

// Theme is intentionally request-specific: the root HTML must vary by the
// readable preference cookie before the browser has a chance to paint.
export const dynamic = "force-dynamic";

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
  const themeCookie = (await cookies()).get(THEME_COOKIE_NAME)?.value;
  const theme = parseTheme(themeCookie);
  const hasThemeCookie = themeCookie === "light" || themeCookie === "dark" || themeCookie === "system";
  const initialResolvedTheme = theme === "dark" ? "dark" : "light";
  const initialBackgroundColor = initialResolvedTheme === "dark" ? "#11131b" : "#ffffff";
  const initialThemeCss = `html,body{background-color:${initialBackgroundColor};color-scheme:${initialResolvedTheme}}@media (prefers-color-scheme:dark){html[data-theme-preference="system"],html[data-theme-preference="system"] body{background-color:#11131b;color-scheme:dark}}`;
  const unreadCommunityActivity = session?.user?.id
    ? await prisma.workoutNotification.count({ where: { userId: session.user.id, readAt: null } })
    : 0;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${initialResolvedTheme} h-full antialiased`}
      data-theme-preference={theme}
      data-theme-cookie={hasThemeCookie ? "true" : "false"}
      style={{ backgroundColor: initialBackgroundColor, colorScheme: initialResolvedTheme }}
    >
      <head>
        <style id="calistheni-initial-theme-css">{initialThemeCss}</style>
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: initialBackgroundColor }}
      >
        <Script id="calistheni-initial-theme" strategy="beforeInteractive">
          {`(()=>{const r=document.documentElement,k='calistheni-theme',v=r.dataset.themePreference,s=r.dataset.themeCookie==='true',l=localStorage.getItem(k),t=!s&&['light','dark','system'].includes(l||'')?l:v,d=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;r.dataset.themePreference=t;r.classList.remove('light','dark');r.classList.add(d);r.style.colorScheme=d;if(!s&&['light','dark','system'].includes(t)){document.cookie=k+'='+t+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}})()`}
        </Script>
        <ThemeProvider initialTheme={theme} initialResolvedTheme={initialResolvedTheme}>
          <NativeShell />
          <AppShell
            user={
              session?.user
                ? { name: session.user.name, email: session.user.email, unreadCommunityActivity }
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
