export type ParkSummary = {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type ParkDetail = ParkSummary & {
  equipment: string[];
};

export type ParkMutationPayload = {
  name: string;
  title: string | null;
  address: string | null;
  lat: number;
  lon: number;
  equipmentIds: number[];
};

export type ParkFormValues = {
  name: string;
  title: string;
  address: string;
  lat: string;
  lon: string;
  equipmentIds: number[];
};

export type ParkFormErrors = Partial<
  Record<"name" | "lat" | "lon" | "equipmentIds", string>
>;

export type ParkViewportBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom?: number;
  limit?: number;
};

export type ParkMarker = {
  id: number;
  lat: number;
  lon: number;
};
