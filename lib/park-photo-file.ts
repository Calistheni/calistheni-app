export const PARK_PHOTO_MAX_FILE_SIZE = 15 * 1024 * 1024;
export const PARK_PHOTO_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

const EXTENSION_FAMILIES = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heif",
  heif: "heif",
} as const;

const MIME_FAMILIES = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heif",
  "image/heif": "heif",
} as const;

export type ParkPhotoExtension = keyof typeof EXTENSION_FAMILIES;
type ParkPhotoFamily = (typeof EXTENSION_FAMILIES)[ParkPhotoExtension];

function getFileExtension(name: string) {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function validateParkPhotoMetadata(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { success: false as const, error: "The selected image is empty." };
  }

  if (file.size > PARK_PHOTO_MAX_FILE_SIZE) {
    return {
      success: false as const,
      error: "Image must be 15 MB or smaller.",
    };
  }

  const extension = getFileExtension(file.name) as ParkPhotoExtension;
  const extensionFamily = EXTENSION_FAMILIES[extension];

  if (!extensionFamily) {
    return {
      success: false as const,
      error: "Use a JPEG, PNG, WebP, HEIC, or HEIF image.",
    };
  }

  const normalizedType = file.type.trim().toLowerCase();
  const mimeFamily = normalizedType
    ? MIME_FAMILIES[normalizedType as keyof typeof MIME_FAMILIES]
    : extensionFamily;

  if (!mimeFamily || mimeFamily !== extensionFamily) {
    return {
      success: false as const,
      error: "The image file type does not match its extension.",
    };
  }

  return {
    success: true as const,
    extension: extension === "jpeg" ? ("jpg" as const) : extension,
    family: extensionFamily,
    contentType:
      normalizedType ||
      (extensionFamily === "jpeg"
        ? "image/jpeg"
        : extensionFamily === "heif"
          ? extension === "heic"
            ? "image/heic"
            : "image/heif"
          : `image/${extensionFamily}`),
  };
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectParkPhotoFamily(bytes: Uint8Array): ParkPhotoFamily | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(
        brand
      )
    ) {
      return "heif";
    }
  }

  return null;
}

export function validateParkPhotoBytes(
  metadata: ReturnType<typeof validateParkPhotoMetadata>,
  bytes: Uint8Array
) {
  if (!metadata.success) {
    return metadata;
  }

  const detectedFamily = detectParkPhotoFamily(bytes);
  if (!detectedFamily || detectedFamily !== metadata.family) {
    return {
      success: false as const,
      error: "The uploaded file is not a valid supported image.",
    };
  }

  return metadata;
}
