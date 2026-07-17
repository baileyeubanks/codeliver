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

const DEFAULT_LABEL = "Webster by co-videopro";

/**
 * The Webster lockup: one wordmark, one four-color registration mark
 * (Bailey's CVP monogram), per the Webster board design system
 * (~/Desktop/webster/WEBSTER_BOARD_SYSTEM.md). Used once per surface.
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
          <span className={styles.product}>WEBSTER</span>
          <span className={styles.company}>by co-videopro</span>
        </span>
      ) : null}
    </span>
  );
}

export default CoProductionBrand;
