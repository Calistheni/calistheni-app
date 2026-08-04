"use client";

import type { ChangeEvent, ComponentProps } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { constrainNoteLength, NOTE_MAX_LENGTH } from "@/lib/notes";
import { cn } from "@/lib/utils";

type NoteTextareaProps = Omit<ComponentProps<typeof Textarea>, "maxLength" | "value"> & {
  value: string | null | undefined;
};

export const EXERCISE_NOTE_MIN_HEIGHT = 38;
export const EXERCISE_NOTE_MAX_HEIGHT = 152;

export function getAutoResizeNoteState(scrollHeight: number) {
  const height = Math.max(EXERCISE_NOTE_MIN_HEIGHT, Math.min(scrollHeight, EXERCISE_NOTE_MAX_HEIGHT));
  return { height, overflowY: scrollHeight > EXERCISE_NOTE_MAX_HEIGHT ? "auto" : "hidden" } as const;
}

function NoteCounter({ id, length }: { id: string; length: number }) {
  return <p id={id} className="text-right text-xs tabular-nums text-muted-foreground" aria-live="polite">{length} / {NOTE_MAX_LENGTH}</p>;
}

function constrainedChange(onChange: NoteTextareaProps["onChange"]) {
  return (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = constrainNoteLength(event.currentTarget.value);
    if (nextValue !== event.currentTarget.value) event.currentTarget.value = nextValue;
    onChange?.(event);
  };
}

/** A regular note input that preserves exactly what the user types until save. */
export function NoteTextarea({ value, className, onChange, ...props }: NoteTextareaProps) {
  const text = constrainNoteLength(value ?? "");
  const generatedId = useId();
  const counterId = `${props.id ?? generatedId}-counter`;
  const describedBy = [props["aria-describedby"], counterId].filter(Boolean).join(" ");
  return <div className="min-w-0 space-y-1"><Textarea {...props} value={text} maxLength={NOTE_MAX_LENGTH} onChange={constrainedChange(onChange)} aria-describedby={describedBy} className={className} /><NoteCounter id={counterId} length={text.length} /></div>;
}

/** Compact exercise-note input that expands only when its contents need more lines. */
export function ExerciseNoteTextarea({ value, className, onChange, ...props }: NoteTextareaProps) {
  const text = constrainNoteLength(value ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const observedWidth = useRef(0);
  const generatedId = useId();
  const counterId = `${props.id ?? generatedId}-counter`;
  const describedBy = [props["aria-describedby"], counterId].filter(Boolean).join(" ");
  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = `${EXERCISE_NOTE_MIN_HEIGHT}px`;
    const state = getAutoResizeNoteState(textarea.scrollHeight);
    textarea.style.height = `${state.height}px`;
    textarea.style.overflowY = state.overflowY;
  }, []);

  useLayoutEffect(resize, [resize, text]);
  useEffect(() => {
    const container = textareaRef.current?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === observedWidth.current) return;
      observedWidth.current = entry.contentRect.width;
      resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resize]);

  return <div className="min-w-0 space-y-1"><Textarea {...props} ref={textareaRef} rows={1} value={text} maxLength={NOTE_MAX_LENGTH} onChange={constrainedChange(onChange)} aria-describedby={describedBy} style={{ ...props.style, minHeight: `${EXERCISE_NOTE_MIN_HEIGHT}px`, resize: "none" }} className={cn("h-[38px] !min-h-[38px] resize-none overflow-y-hidden whitespace-pre-wrap break-words py-2 text-base leading-5 sm:text-sm", className)} /><NoteCounter id={counterId} length={text.length} /></div>;
}
