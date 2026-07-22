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

export function SortableExerciseList({
  ids,
  onMove,
  children,
}: {
  ids: string[];
  onMove: (activeId: string, overId: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
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
      className={cn(isDragging && "relative z-40 opacity-70")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children(dragHandle)}
    </div>
  );
}
