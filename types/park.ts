export type ParkSummary = {
  id: number;
  name: string;
  title: string | null;
  lat: number;
  lon: number;
  address: string | null;
  photoUrl: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type ParksMapResponse = {
  parks: ParkSummary[];
  areaKey: string;
  version: string | null;
  truncated: boolean;
};

export type ParkQrStatus =
  | "NOT_INSTALLED"
  | "INSTALLED"
  | "NEEDS_REPLACEMENT";

export type ParkArchiveStatus = "ACTIVE" | "ARCHIVED" | "ALL";

export type ParkQrDeployment = {
  qrStatus: ParkQrStatus;
  qrInstalledAt: string | null;
  qrInstalledByLabel: string | null;
  qrStatusUpdatedAt: string | null;
  qrCodeNote: string | null;
};

export type AdminParkMapSummary = ParkSummary &
  Pick<ParkQrDeployment, "qrStatus"> & {
    equipmentCount: number;
    submissionStatus: ParkSubmissionStatus;
  };

export type AdminParksMapResponse = Omit<ParksMapResponse, "parks"> & {
  parks: AdminParkMapSummary[];
};

export type ParkClusterPlaceholder = {
  lat: number;
  lon: number;
  count: number;
};

export type ParkDetail = ParkSummary & {
  equipment: string[];
};

export type ParkSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AdminParkDetail = ParkDetail &
  ParkQrDeployment & {
    submissionStatus: ParkSubmissionStatus;
    submission: {
      source: "USER_SUBMISSION" | "UNKNOWN_LEGACY_SOURCE";
      submittedAt: string;
      submitter: { id: string; name: string | null; email: string | null } | null;
    };
    gpsVerification: {
      pinned: { lat: number; lon: number };
      metadata: { lat: number; lon: number; photoIndex: number } | null;
      distanceMeters: number | null;
      status: "MATCHED" | "MISMATCH" | "NO_GPS_DATA";
      gpsPhotoCount: number;
      photos: Array<{
        photoIndex: number;
        locationStatus: "MATCHED" | "MISMATCH" | "NO_GPS_DATA";
        locationDistanceMeters: number | null;
        locationSource: "PHOTO_EXIF" | "BROWSER_GEOLOCATION" | "NONE";
        photoLatitude?: number | null;
        photoLongitude?: number | null;
      }>;
    };
  };

export type AdminParkQrCounts = {
  total: number;
  installed: number;
  notInstalled: number;
  needsReplacement: number;
};

export type UserPark = ParkDetail & {
  submissionStatus: ParkSubmissionStatus;
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
  qrStatus?: ParkQrStatus;
  qrCodeNote?: string | null;
};

export type ParkFormValues = {
  name: string;
  title: string;
  address: string;
  lat: string;
  lon: string;
  equipmentIds: number[];
  qrStatus?: ParkQrStatus;
  qrCodeNote?: string;
};

export type ParkFormErrors = Partial<
  Record<
    "name" | "lat" | "lon" | "equipmentIds" | "photo" | "qrCodeNote",
    string
  >
>;

export type ParkViewportBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  zoom?: number;
  limit?: number;
};
