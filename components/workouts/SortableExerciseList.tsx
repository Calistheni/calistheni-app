"use client";

import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortableExerciseActivator = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging: boolean;
  label: string;
};

export function SortableExerciseList({
  ids,
  onMove,
  onDragStart,
  children,
}: {
  ids: string[];
  onMove: (activeId: string, overId: string) => void;
  onDragStart?: (event: DragStartEvent) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    onMove(String(event.active.id), String(event.over.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableExerciseItem({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dragHandle = (
    <Button
      type="button"
      size="icon-lg"
      variant="ghost"
      className="touch-none cursor-grab active:cursor-grabbing"
      aria-label={`Reorder ${label}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical aria-hidden="true" />
    </Button>
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full min-w-0 max-w-full",
        isDragging && "relative z-40 opacity-70"
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children(dragHandle)}
    </div>
  );
}

export function SortableExerciseActivatorItem({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (activator: SortableExerciseActivator) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full min-w-0 max-w-full",
        isDragging &&
          "relative z-40 bg-card/95 opacity-90 shadow-lg ring-1 ring-primary/40"
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children({ attributes, listeners, isDragging, label })}
    </div>
  );
}
