"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";

interface QRCodeGeneratorProps {
  url: string;
  size?: number;
}

export default function QRCodeGenerator({ url, size = 200 }: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    // Simple QR code using canvas API — for production, use a proper QR library
    // This renders a placeholder with the URL text
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("QR Code", size / 2, size / 2 - 10);
    ctx.font = "9px monospace";
    ctx.fillText(url.slice(0, 40), size / 2, size / 2 + 10);
    if (url.length > 40) {
      ctx.fillText(url.slice(40, 80), size / 2, size / 2 + 24);
    }

    // Generate actual QR using dynamic import
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      }).catch(() => {});
    }).catch(() => {});
  }, [url, size]);

  function downloadQR() {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.download = "share-qr.png";
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-lg border border-[var(--border)]"
      />
      <button
        onClick={downloadQR}
        className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
      >
        <Download size={12} /> Download QR
      </button>
    </div>
  );
}
