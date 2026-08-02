interface CvpMonogramProps {
  /** Rendered height in px; width follows the 74:40 viewBox ratio. */
  size?: number;
  className?: string;
  /** When provided the mark is exposed as an image with this label. */
  title?: string;
}

/**
 * Simplified inline-SVG rendition of the CVP flowing-ribbon monogram, drawn
 * in the canon palette only: Deep Blue letterforms with the V picked out in
 * Primary Blue. Stroked letterforms keep it crisp at small sizes (~24-32px)
 * where the full raster artwork (public/brand/cvp-mark-muted.png) muddies.
 * No multi-colour treatment — brand canon rejects the four-colour mark.
 */
export default function CvpMonogram({ size = 28, className, title }: CvpMonogramProps) {
  const width = Math.round((size * 74) / 40);
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 74 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {/* C — Deep Blue open arc */}
      <path
        d="M19.5 9.4A13 13 0 1 0 19.5 30.6"
        stroke="var(--cvp-ink)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* V — Primary Blue ribbon */}
      <path
        d="M30 9L39 30.5Q39.9 32.4 40.8 30.5L50 9"
        stroke="var(--cvp-blue)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* P — Deep Blue stem, upper ribbon and lower bowl */}
      <path d="M57 10V31" stroke="var(--cvp-ink)" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M57 10C64.5 8.5 69 11.6 69 15"
        stroke="var(--cvp-ink)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M69 15C69 18.6 64.5 21 57 20.5"
        stroke="var(--cvp-ink)"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}
