import styles from "./CoProductionBrand.module.css";

export type CoProductionBrandVariant =
  | "horizontal"
  | "stacked"
  | "compact-mark";

export interface CoProductionBrandProps {
  variant?: CoProductionBrandVariant;
  className?: string;
  label?: string;
  /** Retained for API compatibility with the former raster lockup. */
  priority?: boolean;
  /** Retained for API compatibility with the former raster lockup. */
  sizes?: string;
}

const DEFAULT_LABEL = "Co-VideoPro by Content Co-op";

const CLASS_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: styles.horizontal,
  stacked: styles.stacked,
  "compact-mark": styles.compactMark,
};

/**
 * Co-VideoPro lockup. Rendered as a text wordmark so the product name is real,
 * selectable, theme-aware copy — not a baked raster. The retired
 * co-production-pro PNG lockups remain in /public/brand for reference only.
 */
export function CoProductionBrand({
  variant = "horizontal",
  className,
  label = DEFAULT_LABEL,
}: CoProductionBrandProps) {
  const rootClassName = [styles.brand, CLASS_BY_VARIANT[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClassName} data-brand-variant={variant} role="img" aria-label={label}>
      <span className={styles.mark} aria-hidden="true">
        <span className={styles.markGlyph}>CV</span>
      </span>
      {variant !== "compact-mark" ? (
        <span className={styles.wordmark} aria-hidden="true">
          <span className={styles.product}>Co-VideoPro</span>
          <span className={styles.company}>by Content Co-op</span>
        </span>
      ) : null}
    </span>
  );
}

export default CoProductionBrand;
