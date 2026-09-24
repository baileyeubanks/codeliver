import Image from "next/image";
import styles from "./CoProductionBrand.module.css";

export type CoProductionBrandVariant =
  | "horizontal"
  | "stacked"
  | "compact-mark";

export interface CoProductionBrandProps {
  variant?: CoProductionBrandVariant;
  className?: string;
  label?: string;
  priority?: boolean;
  sizes?: string;
}

const DEFAULT_LABEL = "Co‑VideoPro by Content Co-op";

/** Bailey's sapphire blue long lockup, already transparent, with padding in the file.
 * Layout contains the full artwork. It never crops, redraws, or recolors it. */
export function CoProductionBrand({
  variant = "horizontal",
  className,
  label = DEFAULT_LABEL,
  priority = false,
}: CoProductionBrandProps) {
  const rootClassName = [styles.brand, styles[variant === "compact-mark" ? "compactMark" : variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClassName} data-brand-variant={variant} role="img" aria-label={label}>
      <Image
        className={styles.mark}
        src="/brand/cvp-mark-safe-pad.png"
        alt=""
        width={730}
        height={187}
        priority={priority}
        unoptimized
        draggable={false}
      />

    </span>
  );
}

export default CoProductionBrand;
