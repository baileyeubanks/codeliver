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

const DEFAULT_LABEL = "Co‑ProVideo by Content Co-op";

/**
 * The Co‑ProVideo lockup: monumental display wordmark + the CVP four-color
 * monogram (Bailey's artwork). One mark per surface, per the Co‑ProVideo
 * design bible (docs/COPROVIDEO_DESIGN_BIBLE.md).
 */
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
        src="/brand/cvp-fourcolor-mark.png"
        alt=""
        width={900}
        height={461}
        priority={priority}
        unoptimized
        draggable={false}
      />
      {variant !== "compact-mark" ? (
        <span className={styles.wordmark} aria-hidden="true">
          <span className={styles.product}>Co‑ProVideo</span>
          <span className={styles.company}>by Content Co-op</span>
        </span>
      ) : null}
    </span>
  );
}

export default CoProductionBrand;
