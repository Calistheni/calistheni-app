import Image from "next/image";
import { Package } from "lucide-react";

type FoodVisualSize = "sm" | "lg";

const dimensions: Record<FoodVisualSize, { container: string; display: number }> = {
  sm: { container: "size-12", display: 48 },
  lg: { container: "size-20", display: 80 },
};

const genericIconContainerClass = "flex shrink-0 items-center justify-center";
const productImageContainerClass = "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted";
const placeholderContainerClass = "flex shrink-0 items-center justify-center rounded-lg bg-muted";

/**
 * Product photos and Calistheni's generic artwork intentionally have separate
 * rendering paths. Static PNG icons bypass image optimization so the browser
 * decodes the current transparent asset directly; provider photos retain the
 * optimized Next.js image path. Icon source dimensions are intentionally not
 * part of this component's contract.
 */
export function FoodVisual({
  imageUrl,
  iconPath,
  name,
  size,
}: {
  imageUrl?: string | null;
  iconPath?: string | null;
  name: string;
  size: FoodVisualSize;
}) {
  const { container, display } = dimensions[size];

  if (imageUrl) {
    return <span className={`${container} ${productImageContainerClass}`}><Image src={imageUrl} alt="" width={display} height={display} sizes={`${display}px`} quality={75} className="size-full object-cover" /><span className="sr-only">{name}</span></span>;
  }

  if (iconPath) {
    // Static local artwork intentionally bypasses the optimizer so it is
    // decoded directly from the current public PNG rather than a derivative.
    // eslint-disable-next-line @next/next/no-img-element
    return <span className={`${container} ${genericIconContainerClass}`}><img src={iconPath} alt="" width={display} height={display} draggable={false} className="block size-full object-contain" /><span className="sr-only">{name}</span></span>;
  }

  return <span className={`${container} ${placeholderContainerClass}`}><Package className="size-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{name}</span></span>;
}
