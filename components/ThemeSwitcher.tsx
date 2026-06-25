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
      <div className="flex items-center gap-1 rounded-md border bg-background p-1">
        <div className="h-9 w-[120px]" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md border bg-background p-1">
      <Button
        size="icon"
        variant={theme === "light" ? "default" : "ghost"}
        onClick={() => setTheme("light")}
        aria-label="Use light theme"
      >
        <Sun className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "dark" ? "default" : "ghost"}
        onClick={() => setTheme("dark")}
        aria-label="Use dark theme"
      >
        <Moon className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "system" ? "default" : "ghost"}
        onClick={() => setTheme("system")}
        aria-label="Use system theme"
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  );
}
