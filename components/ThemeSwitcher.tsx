"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

function subscribe() {
  return () => {};
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/60 p-1">
        <div className="h-8 w-[104px]" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/60 p-1 shadow-none">
      <Button
        size="icon"
        variant={theme === "light" ? "secondary" : "ghost"}
        className="size-8 rounded-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        onClick={() => setTheme("light")}
        aria-label="Use light theme"
      >
        <Sun className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "dark" ? "secondary" : "ghost"}
        className="size-8 rounded-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        onClick={() => setTheme("dark")}
        aria-label="Use dark theme"
      >
        <Moon className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "system" ? "secondary" : "ghost"}
        className="size-8 rounded-sm text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        onClick={() => setTheme("system")}
        aria-label="Use system theme"
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  );
}
