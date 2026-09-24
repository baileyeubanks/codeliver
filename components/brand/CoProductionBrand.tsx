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

/** Bailey's sapphire blue long lockup (CVP_BLUE_LONG_TRANSPARENT).
 * Transparent field. Layout contains the full artwork and never crops, redraws, or recolors it. */
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
        src="/brand/CVP_BLUE_LONG_TRANSPARENT.png"
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
