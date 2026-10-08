export function createSupplementLogRequest(
  planId: string,
  scheduledDate: string,
  request: typeof fetch = fetch
) {
  return request(`/api/user/supplements/${planId}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledDate }),
  });
}

export type SupplementLogMutationResponse = {
  created: boolean;
  log: {
    id: string;
    planId: string;
    scheduledFor: string;
    completedAt: string;
    dosage: string | null;
    unit: string | null;
    name: string;
  };
};

/** Converts the canonical server log into the client activity/cache shape. */
export async function readSupplementLogMutationResponse(
  response: Response
): Promise<SupplementLogMutationResponse | null> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const log = body.log as Record<string, unknown> | null;
    if (
      !log ||
      typeof body.created !== "boolean" ||
      typeof log.id !== "string" ||
      typeof log.userSupplementPlanId !== "string" ||
      typeof log.scheduledFor !== "string" ||
      typeof log.completedAt !== "string" ||
      typeof log.supplementNameSnapshot !== "string"
    ) return null;

    const dosage = log.dosageSnapshot;
    const unit = log.unitSnapshot;
    if (
      dosage !== null && dosage !== undefined &&
      typeof dosage !== "string" && typeof dosage !== "number"
    ) return null;
    if (unit !== null && unit !== undefined && typeof unit !== "string") return null;

    return {
      created: body.created,
      log: {
        id: log.id,
        planId: log.userSupplementPlanId,
        scheduledFor: log.scheduledFor,
        completedAt: log.completedAt,
        dosage: dosage === null || dosage === undefined ? null : String(dosage),
        unit: unit ?? null,
        name: log.supplementNameSnapshot,
      },
    };
  } catch {
    return null;
  }
}

export async function readSupplementRequestError(
  response: Response,
  fallback: string
) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
