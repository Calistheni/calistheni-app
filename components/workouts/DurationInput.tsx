"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDurationInput } from "@/lib/duration-input";

export function durationSecondsFromDigits(value: string) {
  const digits = value.replace(/\D/g, "").slice(-8);
  if (!digits) return 0;
  const seconds = Number(digits.slice(-2));
  const minutes = Number(digits.slice(-4, -2) || "0");
  const hours = Number(digits.slice(0, -4) || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

type DurationInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onDurationChange"> & {
  durationSeconds: number | null;
  onDurationChange: (durationSeconds: number) => void;
};

/**
 * A right-aligned time mask: 30 → 00:30, 130 → 01:30, 3000 → 30:00,
 * 10530 → 01:05:30. Colons are rendered at every editing step.
 */
export function DurationInput({ durationSeconds, onDurationChange, onFocus, onBlur, onKeyDown, onPaste, ...props }: DurationInputProps) {
  const [value, setValue] = useState(() => formatDurationInput(durationSeconds));
  const focusedRef = useRef(false);
  const digitsRef = useRef("");

  useEffect(() => {
    if (!focusedRef.current) setValue(formatDurationInput(durationSeconds));
  }, [durationSeconds]);

  function setMaskedValue(digits: string) {
    digitsRef.current = digits.replace(/\D/g, "").slice(-8);
    const seconds = durationSecondsFromDigits(digitsRef.current);
    setValue(formatDurationInput(seconds));
    onDurationChange(seconds);
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value}
      onFocus={(event) => {
        focusedRef.current = true;
        digitsRef.current = "";
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onKeyDown={(event) => {
        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          setMaskedValue(`${digitsRef.current}${event.key}`);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          setMaskedValue(digitsRef.current.slice(0, -1));
          return;
        }
        if (event.key === ":") {
          event.preventDefault();
          return;
        }
        onKeyDown?.(event);
      }}
      onPaste={(event) => {
        event.preventDefault();
        setMaskedValue(event.clipboardData.getData("text"));
        onPaste?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        const seconds = durationSecondsFromDigits(digitsRef.current || value);
        setValue(formatDurationInput(seconds));
        onDurationChange(seconds);
        onBlur?.(event);
      }}
      onChange={() => undefined}
    />
  );
}
