import type { ReactNode } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A single intentional scroll region for tall Nutrition workflows. Radix locks
 * document scrolling while a Sheet is open, so body scrolling cannot be used
 * as a fallback on mobile WebViews.
 */
export function NutritionMobileSheet({
  header,
  children,
  footer,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <SheetContent
      side="bottom"
      className={cn(
        "h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden p-0 sm:h-[min(94dvh,52rem)] sm:max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)]",
        className
      )}
    >
      <div className="shrink-0 border-b pr-10 pt-[max(0.25rem,env(safe-area-inset-top))]">
        {header}
      </div>
      <div
        data-slot="nutrition-sheet-scroll"
        data-keyboard-dismiss-on-scroll
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        {children}
      </div>
      {footer ? (
        <div
          data-slot="nutrition-sheet-footer"
          className="shrink-0 border-t bg-popover px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
        >
          {footer}
        </div>
      ) : null}
    </SheetContent>
  );
}
