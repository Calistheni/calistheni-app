import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type ProfileStatCardProps = {
  label: string;
  value: ReactNode;
};

export function ProfileStatCard({ label, value }: ProfileStatCardProps) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full min-h-24 flex-col p-4">
        <p className="min-h-8 text-xs leading-4 text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold leading-none tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
