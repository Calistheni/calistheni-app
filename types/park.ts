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

export type ParkSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type UserPark = ParkDetail & {
  submissionStatus: ParkSubmissionStatus;
  photoUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
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
  Record<"name" | "lat" | "lon" | "equipmentIds" | "photo", string>
>;

export type ParkViewportBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom?: number;
  limit?: number;
};
