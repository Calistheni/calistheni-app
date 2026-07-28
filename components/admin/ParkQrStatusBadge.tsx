import { CircleCheck, CircleX, QrCode, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParkQrStatus } from "@/types/park";

const QR_STATUS_PRESENTATION = {
  NOT_INSTALLED: {
    label: "No QR",
    icon: CircleX,
    className: "border-border text-muted-foreground",
  },
  INSTALLED: {
    label: "QR installed",
    icon: CircleCheck,
    className:
      "border-primary/30 bg-primary/10 text-primary dark:bg-primary/15",
  },
  NEEDS_REPLACEMENT: {
    label: "Replace QR",
    icon: RefreshCw,
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
} as const;

export function ParkQrStatusBadge({
  status,
  compact = false,
}: {
  status: ParkQrStatus;
  compact?: boolean;
}) {
  const presentation = QR_STATUS_PRESENTATION[status];
  const Icon = compact ? QrCode : presentation.icon;

  return (
    <Badge
      variant="outline"
      className={presentation.className}
      data-qr-status={status}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {presentation.label}
    </Badge>
  );
}
