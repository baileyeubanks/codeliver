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

const DEFAULT_LABEL = "Co-Production Pro by Content Co-op";

const SOURCE_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: "/brand/co-production-pro-horizontal.png",
  stacked: "/brand/co-production-pro-stacked.png",
  "compact-mark": "/brand/co-production-pro-horizontal.png",
};

const CLASS_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: styles.horizontal,
  stacked: styles.stacked,
  "compact-mark": styles.compactMark,
};

const SIZES_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: "(max-width: 480px) 152px, 172px",
  stacked: "(max-width: 480px) 260px, 300px",
  "compact-mark": "(max-width: 480px) 40px, 44px",
};

export function CoProductionBrand({
  variant = "horizontal",
  className,
  label = DEFAULT_LABEL,
  priority = false,
  sizes,
}: CoProductionBrandProps) {
  const rootClassName = [styles.brand, CLASS_BY_VARIANT[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={rootClassName} data-brand-variant={variant}>
      <Image
        className={styles.image}
        src={SOURCE_BY_VARIANT[variant]}
        alt={label}
        width={7296}
        height={4096}
        sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        priority={priority}
        unoptimized
        draggable={false}
      />
    </span>
  );
}

export default CoProductionBrand;
