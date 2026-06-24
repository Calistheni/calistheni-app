"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMounted(true);
  }, []);

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
      >
        <Sun className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "dark" ? "default" : "ghost"}
        onClick={() => setTheme("dark")}
      >
        <Moon className="h-4 w-4" />
      </Button>

      <Button
        size="icon"
        variant={theme === "system" ? "default" : "ghost"}
        onClick={() => setTheme("system")}
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  );
}
