"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type NutritionAiConsentRequest = {
  description: string;
  onApprove: () => void;
  onCancel?: () => void;
};

export function NutritionAiConsentDialog({
  request,
  onDismiss,
}: {
  request: NutritionAiConsentRequest | null;
  onDismiss: () => void;
}) {
  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (open) return;
        onDismiss();
        request?.onCancel?.();
      }}
    >
      <AlertDialogContent className="z-[80]" overlayClassName="z-[80]">
        <AlertDialogHeader>
          <AlertDialogTitle>Send to OpenAI?</AlertDialogTitle>
          <AlertDialogDescription>
            {request?.description} OpenAI may retain request content for safety
            monitoring. You can cancel and log foods manually.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onDismiss();
              request?.onApprove();
            }}
          >
            Send to OpenAI
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
