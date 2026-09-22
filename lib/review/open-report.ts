import { renderReviewReport, type ReviewReportInput } from "./report.ts";

/** User-initiated preview; browser printing creates the PDF without a provider. */
export function openReviewReport(input: ReviewReportInput): boolean {
  const preview = window.open("", "_blank");
  if (!preview) return false;
  preview.opener = null;
  preview.document.open();
  preview.document.write(renderReviewReport(input));
  preview.document.close();
  const button = preview.document.getElementById("print-review") as HTMLButtonElement | null;
  button?.addEventListener("click", async () => {
    button.disabled = true;
    const status = preview.document.getElementById("report-status");
    if (status) status.textContent = "Preparing images and type…";
    const images = Array.from(preview.document.images);
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          preview.document.fonts.ready,
          ...images.map(image => image.decode().catch(() => undefined)),
        ]),
        new Promise(resolve => { readinessTimer = setTimeout(resolve, 8_000); }),
      ]);
    } finally {
      clearTimeout(readinessTimer);
    }
    if (preview.closed) return;
    const unavailable = images.filter(image => image.naturalWidth === 0);
    for (const image of unavailable) {
      const caption = image.parentElement?.querySelector("figcaption");
      if (caption && !caption.textContent?.includes("unavailable")) caption.textContent += " — image unavailable";
    }
    if (status) status.textContent = unavailable.length ? `${unavailable.length} reference image(s) unavailable; captions are retained.` : "Ready to print or save PDF.";
    button.disabled = false;
    preview.focus();
    preview.print();
  });
  return true;
}
