import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import jsQR from "jsqr";
import { Camera, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Native BarcodeDetector (Chrome/Edge/Android) when available — fast and off the main thread; otherwise jsQR on a canvas frame (Safari/Firefox). */
function createDetector(): Detector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }).BarcodeDetector;
  try {
    return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

function decodeWithJsQr(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | null {
  if (!width || !height) return null;
  // Downscale large frames/photos — jsQR is O(pixels) and a phone photo can be 12MP.
  const scale = Math.min(1, 800 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/**
 * Live camera QR scanner with an image-upload fallback (desktop without a camera, or a screenshot
 * someone sent). Calls `onResult` once with the first decoded payload, then stops the camera.
 */
export function QrScanner({ onResult }: { onResult: (value: string) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "no-camera">("starting");
  const [fileError, setFileError] = useState<string | null>(null);

  const finish = (value: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onResult(value);
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const detector = createDetector();

    const tick = async () => {
      const video = videoRef.current;
      if (cancelled || doneRef.current || !video) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        try {
          const value = detector
            ? (await detector.detect(video))[0]?.rawValue ?? null
            : decodeWithJsQr(video, video.videoWidth, video.videoHeight, canvasRef.current);
          if (value) return finish(value);
        } catch {
          // a single bad frame — keep scanning
        }
      }
      raf = requestAnimationFrame(() => void tick());
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus("no-camera");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");
        void tick();
      } catch {
        setStatus("no-camera");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const detector = createDetector();
      const value = detector
        ? (await detector.detect(bitmap))[0]?.rawValue ?? null
        : decodeWithJsQr(bitmap, bitmap.width, bitmap.height, canvasRef.current);
      if (value) finish(value);
      else setFileError(t("transfer.scan.noCodeInImage", "No QR code found in that image."));
    } catch {
      setFileError(t("transfer.scan.imageUnreadable", "Couldn't read that image."));
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-3/5 w-3/5 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* corner brackets */}
              <span className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
              <span className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
              <span className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-2xl border-b-4 border-r-4 border-primary" />
              <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-primary/80" />
            </div>
          </div>
        )}
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === "no-camera" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
            <Camera className="h-8 w-8" />
            {t("transfer.scan.noCamera", "Camera unavailable. Allow camera access, or upload a photo of the QR code instead.")}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("transfer.scan.hint", "Point your camera at the recipient's Receive QR code.")}</p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
        <ImageUp className="h-4 w-4" /> {t("transfer.scan.upload", "Upload QR image")}
      </Button>
      {fileError && <p className="text-center text-xs text-destructive">{fileError}</p>}
    </div>
  );
}
