"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AdminReward = {
  id: number;
  title: string;
  partnerName: string;
  description: string;
  imageUrl: string | null;
  pointsCost: number;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RewardFormValues = {
  title: string;
  partnerName: string;
  description: string;
  imageUrl: string;
  pointsCost: string;
  active: boolean;
};

type RewardsAdminClientProps = {
  rewards: AdminReward[];
};

const EMPTY_FORM_VALUES: RewardFormValues = {
  title: "",
  partnerName: "",
  description: "",
  imageUrl: "",
  pointsCost: "",
  active: true,
};

function getFormValues(reward: AdminReward): RewardFormValues {
  return {
    title: reward.title,
    partnerName: reward.partnerName,
    description: reward.description,
    imageUrl: reward.imageUrl ?? "",
    pointsCost: String(reward.pointsCost),
    active: reward.active,
  };
}

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };

    return payload.error || "We couldn't save this reward. Please try again.";
  } catch {
    return "We couldn't save this reward. Please try again.";
  }
}

export function RewardsAdminClient({
  rewards,
}: RewardsAdminClientProps) {
  const [items, setItems] = useState(rewards);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formValues, setFormValues] =
    useState<RewardFormValues>(EMPTY_FORM_VALUES);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function updateField<Field extends keyof RewardFormValues>(
    field: Field,
    value: RewardFormValues[Field]
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setFormValues(EMPTY_FORM_VALUES);
  }

  function startEditing(reward: AdminReward) {
    setEditingId(reward.id);
    setFormValues(getFormValues(reward));
  }

  async function saveReward() {
    setIsSaving(true);

    try {
      const response = await fetch(
        editingId ? `/api/admin/rewards/${editingId}` : "/api/admin/rewards",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formValues,
            pointsCost: Number(formValues.pointsCost),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      const reward = (await response.json()) as AdminReward;

      setItems((current) =>
        editingId
          ? current.map((item) => (item.id === reward.id ? reward : item))
          : [reward, ...current]
      );
      resetForm();
      toast.success(editingId ? "Reward updated." : "Reward created.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't save this reward. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteReward(reward: AdminReward) {
    if (!window.confirm(`Delete ${reward.title}?`)) {
      return;
    }

    setDeletingId(reward.id);

    try {
      const response = await fetch(`/api/admin/rewards/${reward.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      setItems((current) => current.filter((item) => item.id !== reward.id));

      if (editingId === reward.id) {
        resetForm();
      }

      toast.success("Reward deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't delete this reward. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">
            {editingId ? "Edit Reward" : "Create Reward"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage demo rewards for the future Pro rewards program.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="reward-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="reward-title"
              value={formValues.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="10% OFF Partner"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reward-partner" className="text-sm font-medium">
              Partner
            </label>
            <Input
              id="reward-partner"
              value={formValues.partnerName}
              onChange={(event) =>
                updateField("partnerName", event.target.value)
              }
              placeholder="Demo Partner"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label
              htmlFor="reward-description"
              className="text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="reward-description"
              value={formValues.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              placeholder="Demo reward placeholder for launch planning."
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reward-image" className="text-sm font-medium">
              Image
            </label>
            <Input
              id="reward-image"
              value={formValues.imageUrl}
              onChange={(event) => updateField("imageUrl", event.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reward-points" className="text-sm font-medium">
              Points Cost
            </label>
            <Input
              id="reward-points"
              type="number"
              min="1"
              step="1"
              value={formValues.pointsCost}
              onChange={(event) =>
                updateField("pointsCost", event.target.value)
              }
              placeholder="500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
            <Checkbox
              checked={formValues.active}
              onCheckedChange={(checked) =>
                updateField("active", checked === true)
              }
            />
            Active
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="button" onClick={() => void saveReward()} disabled={isSaving}>
              {isSaving ? "Saving..." : editingId ? "Update Reward" : "Create Reward"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSaving}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Rewards</h2>
          <p className="text-sm text-muted-foreground">
            Redemption management is intentionally not enabled yet.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No rewards have been created yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reward</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell className="min-w-72">
                      <div className="font-medium">{reward.title}</div>
                      <div className="max-w-md whitespace-normal text-sm text-muted-foreground">
                        {reward.description}
                      </div>
                    </TableCell>
                    <TableCell>{reward.partnerName}</TableCell>
                    <TableCell>
                      {reward.pointsCost.toLocaleString()} points
                    </TableCell>
                    <TableCell>
                      <Badge variant={reward.active ? "secondary" : "outline"}>
                        {reward.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(reward)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteReward(reward)}
                          disabled={deletingId === reward.id}
                        >
                          {deletingId === reward.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
