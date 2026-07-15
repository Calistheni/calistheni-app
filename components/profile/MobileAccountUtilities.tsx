"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";

export function MobileAccountUtilities() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Theme</p>
        <ThemeSwitcher />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        <LogOut aria-hidden="true" />
        Logout
      </Button>
    </div>
  );
}
