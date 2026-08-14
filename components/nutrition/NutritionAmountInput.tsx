"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  formatNutritionAmount,
  parseNutritionAmount,
} from "@/lib/nutrition/amount-input";

export function NutritionAmountInput({
  initialValue,
  onValidChange,
  onValidityChange,
  ariaLabel,
  className,
}: {
  initialValue: number;
  onValidChange: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => formatNutritionAmount(initialValue));
  const [lastValid, setLastValid] = useState(() => initialValue);

  function update(next: string) {
    setDraft(next);
    const parsed = parseNutritionAmount(next);
    onValidityChange?.(parsed !== null);
    if (parsed === null) return;
    setLastValid(parsed);
    onValidChange(parsed);
  }

  function commit() {
    const parsed = parseNutritionAmount(draft);
    if (parsed !== null) return;
    setDraft(formatNutritionAmount(lastValid));
    onValidChange(lastValid);
    onValidityChange?.(true);
  }

  return (
    <Input
      aria-label={ariaLabel}
      className={className ?? "text-base"}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => update(event.target.value)}
      onBlur={commit}
    />
  );
}
