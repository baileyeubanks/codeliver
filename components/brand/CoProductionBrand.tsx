import type { CSSProperties } from "react";
import Image from "next/image";
import styles from "./CoProductionBrand.module.css";

export type CoProductionBrandVariant =
  | "horizontal"
  | "wordmark"
  | "stacked"
  | "compact-mark";

export interface CoProductionBrandProps {
  variant?: CoProductionBrandVariant;
  className?: string;
  label?: string;
  source?: string;
  priority?: boolean;
  sizes?: string;
  style?: CSSProperties & Record<`--${string}`, string | number>;
}

const DEFAULT_LABEL = "Co-VideoPro production workspace";
const CANONICAL_SOURCE = "/brand/co-videopro-color-supplied.png";
const HORIZONTAL_SOURCE = "/brand/co-videopro-shell-lockup.png";
const WORDMARK_SOURCE = "/brand/co-videopro-blue-wordmark.png";

const CLASS_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: styles.horizontal,
  wordmark: styles.wordmark,
  stacked: styles.stacked,
  "compact-mark": styles.compactMark,
};

const SIZES_BY_VARIANT: Record<CoProductionBrandVariant, string> = {
  horizontal: "(max-width: 480px) 152px, 172px",
  wordmark: "(max-width: 480px) 148px, 184px",
  stacked: "(max-width: 480px) 260px, 300px",
  "compact-mark": "(max-width: 480px) 56px, 62px",
};

export function CoProductionBrand({
  variant = "horizontal",
  className,
  label = DEFAULT_LABEL,
  source,
  priority = false,
  sizes,
  style,
}: CoProductionBrandProps) {
  const rootClassName = [styles.brand, CLASS_BY_VARIANT[variant], className]
    .filter(Boolean)
    .join(" ");

  const imageProps = {
    loading: priority ? "eager" as const : undefined,
    fetchPriority: priority ? "high" as const : undefined,
    unoptimized: true,
    draggable: false,
  };
  return (
    <span
      className={rootClassName}
      data-brand-variant={variant}
      role="img"
      aria-label={label}
      style={style}
    >
      {source ? (
        <Image
          {...imageProps}
          src={source}
          alt=""
          fill
          className={styles.customImage}
          sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        />
      ) : variant === "horizontal" ? (
        <Image
          {...imageProps}
          src={HORIZONTAL_SOURCE}
          width={730}
          height={187}
          className={styles.horizontalImage}
          alt=""
          sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        />
      ) : variant === "wordmark" ? (
        <Image
          {...imageProps}
          src={WORDMARK_SOURCE}
          width={620}
          height={120}
          className={styles.wordmarkImage}
          alt=""
          sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        />
      ) : (
        <Image
          {...imageProps}
          src={CANONICAL_SOURCE}
          width={7296}
          height={4096}
          className={styles.image}
          alt=""
          sizes={sizes ?? SIZES_BY_VARIANT[variant]}
        />
      )}
    </span>
  );
}

export default CoProductionBrand;
