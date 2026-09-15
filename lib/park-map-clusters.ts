type ParkIdentity = {
  id: number;
};

type ClusterLeaf = {
  properties?: {
    parkId?: unknown;
  } | null;
};

export function dedupeParksById<T extends ParkIdentity>(parks: T[]): T[] {
  const parksById = new Map<number, T>();

  parks.forEach((park) => {
    if (!Number.isInteger(park.id) || park.id <= 0) return;
    parksById.set(park.id, park);
  });

  return [...parksById.values()];
}

export function getClusterLeafParkIds(leaves: ClusterLeaf[]): number[] {
  const parkIds = new Set<number>();

  leaves.forEach((leaf) => {
    const parkId = Number(leaf.properties?.parkId);
    if (Number.isInteger(parkId) && parkId > 0) {
      parkIds.add(parkId);
    }
  });

  return [...parkIds];
}

export function countRepresentedClusterChildren({
  childClusterCounts,
  unclusteredParkIds,
}: {
  childClusterCounts: number[];
  unclusteredParkIds: number[];
}): number {
  const clusteredParkCount = childClusterCounts.reduce(
    (total, count) =>
      Number.isInteger(count) && count >= 2 ? total + count : total,
    0
  );

  return clusteredParkCount + new Set(unclusteredParkIds).size;
}
