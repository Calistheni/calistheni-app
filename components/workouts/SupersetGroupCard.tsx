"use client";

import type { ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  EllipsisVertical,
  Layers2,
  Pencil,
  Timer,
  Unlink2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SUPERSET_COLOR_STYLES } from "@/lib/workout-supersets";
import type { SupersetColorKey } from "@/types/workout";

type SupersetGroupCardProps = {
  label: string;
  colorKey: SupersetColorKey;
  exerciseNames: string[];
  currentRound: number;
  totalRounds: number;
  completedRounds: number;
  openEnded: boolean;
  restLabel: string;
  activeRestSeconds?: number | null;
  complete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onEdit: () => void;
  onViewRounds: () => void;
  onDissolve: () => void;
  isSavingRound: boolean;
  children: ReactNode;
};

export function SupersetGroupCard({
  label,
  colorKey,
  exerciseNames,
  currentRound,
  totalRounds,
  completedRounds,
  openEnded,
  restLabel,
  activeRestSeconds = null,
  complete,
  open,
  onOpenChange,
  onDone,
  onEdit,
  onViewRounds,
  onDissolve,
  isSavingRound,
  children,
}: SupersetGroupCardProps) {
  const styles = SUPERSET_COLOR_STYLES[colorKey];
  const exerciseSummary = exerciseNames.join(" + ");

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="block w-full min-w-0 max-w-full"
    >
      <section
        className="relative w-full min-w-0 max-w-full border-b border-border/70 bg-transparent pb-2 [overflow-anchor:none] md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:pb-0 md:shadow-sm"
        aria-label={`${label}, ${exerciseNames.length} exercises`}
      >
        <span
          className={cn("absolute inset-y-0 left-0 w-0.5", styles.accent)}
          aria-hidden="true"
        />
        <header className="space-y-2 px-0 py-2 pl-2 md:space-y-2.5 md:px-3 md:py-3 md:pl-4">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={styles.badge}>
                  <Layers2 aria-hidden="true" />
                  {label}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                    complete
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                  role="status"
                >
                  {complete ? (
                    <>
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      All rounds complete
                    </>
                  ) : openEnded ? (
                    completedRounds === 0
                      ? "No rounds completed"
                      : `${completedRounds} ${
                          completedRounds === 1 ? "round" : "rounds"
                        } completed`
                  ) : completedRounds > 0 ? (
                    `${completedRounds} of ${totalRounds} rounds complete`
                  ) : (
                    `Round ${currentRound} of ${totalRounds}`
                  )}
                </span>
              </div>
              <p
                className="line-clamp-2 max-w-full break-words text-sm leading-snug font-semibold"
                title={exerciseSummary}
              >
                {exerciseSummary}
              </p>
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="size-3.5" aria-hidden="true" />
                {activeRestSeconds !== null
                  ? `${activeRestSeconds}s remaining`
                  : restLabel}
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
                aria-expanded={open}
              >
                <ChevronDown
                  className={cn(
                    "transition-transform duration-200",
                    open && "rotate-180"
                  )}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!complete ? (
              <Button
                type="button"
                size="sm"
                className="min-w-24"
                onClick={onDone}
                disabled={isSavingRound}
                aria-label={`Done with ${label} round ${currentRound}`}
              >
                <Check aria-hidden="true" />
                Add round
              </Button>
            ) : (
              <div className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {totalRounds}/{totalRounds} rounds
              </div>
            )}
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`Edit ${label}`}
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`More actions for ${label}`}
                >
                  <EllipsisVertical aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onViewRounds}>
                  <CheckCircle2 aria-hidden="true" />
                  View / edit rounds
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDissolve}>
                  <Unlink2 aria-hidden="true" />
                  Dissolve superset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <CollapsibleContent>
          <div className="pl-2 md:border-t md:pl-0">
            <p className="pb-1 text-xs text-muted-foreground md:px-3 md:pt-2">
              Add sets to an exercise below, or use Add round for the full superset.
            </p>
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
