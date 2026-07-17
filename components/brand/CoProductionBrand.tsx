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

const DEFAULT_LABEL = "Co-VideoPro by Content Co-op";

/**
 * The Co-VideoPro lockup — Bailey's CVP artwork (blue/navy, film+document
 * monogram). Chrome uses the blue horizontal; hero moments use the colorful
 * stacked; compact uses the blue mark. Source artwork: ~/Desktop/CVP BLUE*.
 */
const SOURCE_BY_VARIANT: Record<CoProductionBrandVariant, { src: string; width: number; height: number }> = {
  horizontal: { src: "/brand/cvp-long.png", width: 730, height: 187 },
  stacked: { src: "/brand/cvp-stacked.png", width: 1600, height: 852 },
  "compact-mark": { src: "/brand/cvp-mark.png", width: 786, height: 565 },
};

const CLASS_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: styles.horizontal,
  stacked: styles.stacked,
  "compact-mark": styles.compactMark,
};

const SIZES_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: "(max-width: 480px) 150px, 172px",
  stacked: "(max-width: 480px) 260px, 320px",
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
  const source = SOURCE_BY_VARIANT[variant];

  return (
    <span className={rootClassName} data-brand-variant={variant}>
      <Image
        className={styles.image}
        src={source.src}
        alt={label}
        width={source.width}
        height={source.height}
        sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        priority={priority}
        unoptimized
        draggable={false}
      />
    </span>
  );
}

export default CoProductionBrand;
