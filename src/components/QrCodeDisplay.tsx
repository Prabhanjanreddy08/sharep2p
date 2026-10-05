import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCodeDisplay({ value, small = false }: { value: string; small?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        margin: 2,
        width: small ? 164 : 250,
        color: {
          dark: "#1a1614",
          light: "#faf8f5",
        },
        errorCorrectionLevel: "M",
      });
    }
  }, [value, small]);

  return (
    <div
      className={`mx-auto relative aspect-square w-full rounded-2xl bg-[#faf8f5] p-3 shadow-inner flex items-center justify-center ${
        small ? "max-w-[164px]" : "max-w-[250px]"
      }`}
      aria-label="QR pairing code"
      data-testid="display-qr-code"
    >
      <canvas ref={canvasRef} className="h-full w-full rounded-xl" />
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-accent/25" />
    </div>
  );
}
