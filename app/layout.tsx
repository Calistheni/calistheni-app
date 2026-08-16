import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { auth } from "@/auth";
import { AppShell } from "@/components/navigation/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NativeShell } from "@/components/native/NativeShell";
import { UserActivityHeartbeat } from "@/components/user/UserActivityHeartbeat";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { parseTheme, THEME_COOKIE_NAME, type Theme } from "@/lib/theme";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#11131b";

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

function hasValidThemeCookie(value: string | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getServerResolvedTheme(theme: Theme) {
  return theme === "dark" ? "dark" : "light";
}

export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const resolvedTheme = getServerResolvedTheme(theme);

  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "resizes-content",
    colorScheme: theme === "system" ? "light dark" : resolvedTheme,
    themeColor:
      theme === "system"
        ? [
            {
              media: "(prefers-color-scheme: light)",
              color: "#2563eb",
            },
            {
              media: "(prefers-color-scheme: dark)",
              color: "#09090b",
            },
          ]
        : resolvedTheme === "dark"
        ? "#09090b"
        : "#2563eb",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawThemeCookie = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const hasThemeCookie = hasValidThemeCookie(rawThemeCookie);
  const theme = parseTheme(rawThemeCookie);
  const serverResolvedTheme = getServerResolvedTheme(theme);

  const session = await auth();

  const unreadCommunityActivity = session?.user?.id
    ? await prisma.workoutNotification.count({
        where: {
          userId: session.user.id,
          readAt: null,
        },
      })
    : 0;

  /*
   * This script is deliberately rendered directly inside <head>.
   *
   * The previous version used next/script inside <body>. When the cookie had
   * not yet been created but localStorage already contained "dark", the server
   * rendered a light document and the script changed it only after the browser
   * had already painted that light frame.
   *
   * This initializer executes before the body is parsed and before first paint.
   * It only needs to consult localStorage when there is no valid server-readable
   * theme cookie. Once the cookie exists, the server-rendered class remains the
   * source of truth.
   */
  const initialThemeScript = `
(() => {
  const root = document.documentElement;
  const storageKey = ${JSON.stringify(THEME_COOKIE_NAME)};
  const hasServerCookie = root.dataset.themeCookie === "true";
  const serverPreference = root.dataset.themePreference;

  let preference = serverPreference;

  if (!hasServerCookie) {
    try {
      const storedPreference = window.localStorage.getItem(storageKey);

      if (
        storedPreference === "light" ||
        storedPreference === "dark" ||
        storedPreference === "system"
      ) {
        preference = storedPreference;
      }
    } catch {
      // localStorage may be unavailable. Keep the server fallback.
    }
  }

  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference === "dark"
        ? "dark"
        : "light";

  const background =
    resolved === "dark"
      ? ${JSON.stringify(DARK_BACKGROUND)}
      : ${JSON.stringify(LIGHT_BACKGROUND)};

  root.dataset.themePreference = preference;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.backgroundColor = background;
  root.style.colorScheme = resolved;

  if (!hasServerCookie) {
    try {
      document.cookie =
        storageKey +
        "=" +
        preference +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (window.location.protocol === "https:" ? "; Secure" : "");
    } catch {
      // Cookie persistence failure must not prevent theme application.
    }
  }
})();
`;

  const criticalThemeCss = `
html {
  min-height: 100%;
  background-color: ${LIGHT_BACKGROUND};
  color-scheme: light;
}

html.dark {
  background-color: ${DARK_BACKGROUND};
  color-scheme: dark;
}

html.light {
  background-color: ${LIGHT_BACKGROUND};
  color-scheme: light;
}

html body {
  min-height: 100%;
  background-color: inherit;
}

html[data-theme-preference="system"] {
  background-color: ${LIGHT_BACKGROUND};
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  html[data-theme-preference="system"] {
    background-color: ${DARK_BACKGROUND};
    color-scheme: dark;
  }
}
`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${serverResolvedTheme} h-full antialiased`}
      data-theme-preference={theme}
      data-theme-cookie={hasThemeCookie ? "true" : "false"}
      style={{
        backgroundColor:
          serverResolvedTheme === "dark" ? DARK_BACKGROUND : LIGHT_BACKGROUND,
        colorScheme: serverResolvedTheme,
      }}
    >
      <head>
        <style
          id="calistheni-critical-theme"
          dangerouslySetInnerHTML={{ __html: criticalThemeCss }}
        />

        <script
          id="calistheni-initial-theme"
          dangerouslySetInnerHTML={{ __html: initialThemeScript }}
        />
      </head>

      <body className="flex min-h-full flex-col">
        <ThemeProvider
          initialTheme={theme}
          initialResolvedTheme={serverResolvedTheme}
        >
          <NativeShell />

          {session?.user?.id ? <UserActivityHeartbeat /> : null}

          <AppShell
            user={
              session?.user
                ? {
                    name: session.user.name,
                    email: session.user.email,
                    unreadCommunityActivity,
                  }
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
