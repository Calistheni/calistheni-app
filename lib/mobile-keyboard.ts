"use client";

import { Keyboard } from "@capacitor/keyboard";
import { isNativeApp } from "@/lib/native/platform";

export function dismissActiveTextInput() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return false;
  active.blur();
  if (isNativeApp()) void Keyboard.hide().catch(() => undefined);
  return true;
}
