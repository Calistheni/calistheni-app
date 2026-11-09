import { isSafeParkPhotoObjectKey } from "@/lib/park-photo-keys";

export type ParkPhotoReference =
  | { kind: "key"; key: string }
  | { kind: "external" }
  | { kind: "invalid" };

function decodeObjectPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return null;
  const decoded: string[] = [];
  try {
    for (const segment of segments) {
      const value = decodeURIComponent(segment);
      if (value.includes("/") || value.includes("\\")) return null;
      decoded.push(value);
    }
  } catch {
    return null;
  }
  const key = decoded.join("/");
  return isSafeParkPhotoObjectKey(key) && /^(?:parks|pending\/parks)\//.test(key)
    ? key
    : null;
}

/**
 * Resolves only URLs on the configured public R2 origin (including a custom
 * CDN domain configured as that public URL), or explicit relative object keys.
 * Query strings and fragments do not form part of an R2 object key.
 */
export function parseParkPhotoReference(
  value: string,
  configuredPublicUrl: string,
): ParkPhotoReference {
  if (!value || value.trim() !== value) return { kind: "invalid" };

  const raw = value.trim();
  if (isSafeParkPhotoObjectKey(raw) && /^(?:parks|pending\/parks)\//.test(raw)) {
    return { kind: "key", key: raw };
  }

  const rawPath = raw
    .replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*/i, "")
    .split(/[?#]/, 1)[0] ?? "";
  try {
    for (const segment of rawPath.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
        return { kind: "invalid" };
      }
    }
  } catch {
    return { kind: "invalid" };
  }

  let base: URL;
  let parsed: URL;
  try {
    base = new URL(configuredPublicUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return { kind: "invalid" };
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
    parsed = new URL(raw, base);
  } catch {
    return { kind: "invalid" };
  }

  if (parsed.username || parsed.password) return { kind: "external" };
  if (parsed.origin !== base.origin) return { kind: "external" };

  const basePath = base.pathname;
  if (!parsed.pathname.startsWith(basePath)) return { kind: "external" };
  const key = decodeObjectPath(parsed.pathname.slice(basePath.length));
  return key ? { kind: "key", key } : { kind: "invalid" };
}
