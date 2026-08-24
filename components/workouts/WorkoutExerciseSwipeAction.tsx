"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getWorkoutExerciseSwipeDirection,
  getWorkoutExerciseSwipeOffset,
  shouldOpenWorkoutExerciseSwipe,
  WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH,
  type WorkoutExerciseSwipeDirection,
} from "@/lib/workout-exercise-swipe";

const INTERACTIVE_CONTROL_SELECTOR =
  "button, input, textarea, select, a, [contenteditable='true'], [data-no-exercise-swipe]";

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  direction: WorkoutExerciseSwipeDirection;
  initiallyOpen: boolean;
};

export function WorkoutSetSwipeDeleteAction({
  setLabel,
  disabled = false,
  isOpen,
  onOpenChange,
  onDelete,
  children,
}: {
  setLabel: string;
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<SwipeGesture | null>(null);
  const [gestureOffset, setGestureOffset] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeFromOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener("pointerdown", closeFromOutsidePress, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutsidePress, true);
    };
  }, [isOpen, onOpenChange]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      disabled ||
      event.pointerType === "mouse" ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest(INTERACTIVE_CONTROL_SELECTOR)
    ) {
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
      initiallyOpen: isOpen,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const direction =
      gesture.direction ?? getWorkoutExerciseSwipeDirection(deltaX, deltaY);

    if (direction === "vertical") {
      gesture.direction = direction;
      return;
    }

    if (direction !== "horizontal") return;

    gesture.direction = direction;
    event.preventDefault();
    setGestureOffset(
      getWorkoutExerciseSwipeOffset(deltaX, gesture.initiallyOpen)
    );
  }

  function finishGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    if (gesture.direction === "horizontal") {
      onOpenChange(
        shouldOpenWorkoutExerciseSwipe(deltaX, gesture.initiallyOpen)
      );
    } else if (gesture.direction === null && gesture.initiallyOpen) {
      onOpenChange(false);
    }

    gestureRef.current = null;
    setGestureOffset(null);
  }

  function cancelGesture() {
    gestureRef.current = null;
    setGestureOffset(null);
  }

  const offset =
    gestureOffset ?? (!disabled && isOpen ? -WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH : 0);
  const isDeleteRevealed = !disabled && offset < 0;

  return (
    <div
      ref={rootRef}
      className="relative w-full max-w-full overflow-hidden"
      data-workout-set-swipe
    >
      <div
        className={`absolute inset-y-0 right-0 flex items-stretch ${
          isDeleteRevealed ? "visible opacity-100" : "invisible opacity-0"
        }`}
        style={{ width: WORKOUT_EXERCISE_SWIPE_ACTION_WIDTH }}
        aria-hidden={!isDeleteRevealed}
      >
        <Button
          type="button"
          variant="destructive"
          className="h-full w-full rounded-none px-2"
          aria-label={`Delete ${setLabel}`}
          tabIndex={isDeleteRevealed ? 0 : -1}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>
      <div
        className={`relative z-10 touch-pan-y bg-background ${
          gestureOffset === null
            ? "transition-transform duration-150 ease-out"
            : "transition-none"
        }`}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
      >
        {children}
      </div>
    </div>
  );
}
