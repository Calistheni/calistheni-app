export type ParkSummary = {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
};

export type ParkDetail = ParkSummary & {
  equipment: string[];
};

export type ParkViewportBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom?: number;
  limit?: number;
};
