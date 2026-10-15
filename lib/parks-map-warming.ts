"use client";

let parksMapModule: Promise<typeof import("@/components/ParksMap")> | null =
  null;

/**
 * Download and evaluate the Parks client module without rendering Parks.
 * Map construction and location access remain inside mounted component effects
 * and explicit user actions, respectively.
 */
export function warmParksMapCode() {
  parksMapModule ??= import("@/components/ParksMap").catch((error) => {
    parksMapModule = null;
    throw error;
  });
  return parksMapModule;
}
