"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

/** Minimal BarcodeDetector surface (native in Chrome/Android; a WebAssembly ponyfill elsewhere, e.g. iOS Safari). */
type Detector = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

let detectorPromise: Promise<Detector> | null = null;
function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    if (Native) {
      const supported = (await Native.getSupportedFormats?.()) ?? FORMATS;
      if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    }
    const mod = await import("barcode-detector/ponyfill");
    // Self-hosted wasm (copied into /public/vendor on install), so no third-party CDN.
    mod.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path) } });
    return new mod.BarcodeDetector({ formats: FORMATS as ["ean_13"] }) as unknown as Detector;
  })();
  return detectorPromise;
}

const valid = (v: string) => /^\d{8,14}$/.test(v);

/** Live camera scan, with photo and typed-number fallbacks. Calls onCode once. */
export function BarcodeScanner({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "nocamera" | "error">("starting");
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const done = useRef(false);
  // Latest callback without restarting the camera when the parent re-renders.
  const cb = useRef(onCode);
  useEffect(() => {
    cb.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let live = true;
    const finish = (code: string) => {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(30);
      stream?.getTracks().forEach((t) => t.stop());
      cb.current(code);
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("nocamera");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      } catch {
        if (live) setState("nocamera");
        return;
      }
      if (!live || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      let detector: Detector;
      try {
        detector = await getDetector();
      } catch {
        if (live) setState("error");
        return;
      }
      if (!live) return;
      setState("scanning");
      let running = false;
      timer = setInterval(async () => {
        const v = video.current;
        if (running || done.current || !v || v.readyState < 2) return;
        running = true;
        try {
          const hit = (await detector.detect(v)).find((b) => valid(b.rawValue));
          if (hit) finish(hit.rawValue);
        } catch {
          /* frame not ready; keep trying */
        } finally {
          running = false;
        }
      }, 250);
    })();
    return () => {
      live = false;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const fromPhoto = async (file: File) => {
    setMsg(null);
    try {
      const [detector, bitmap] = await Promise.all([getDetector(), createImageBitmap(file)]);
      const hit = (await detector.detect(bitmap)).find((b) => valid(b.rawValue));
      if (hit && !done.current) {
        done.current = true;
        cb.current(hit.rawValue);
      } else setMsg("No barcode found in that photo. Get closer, or type the number.");
    } catch {
      setMsg("Couldn't read that photo. Type the number instead.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden border border-line bg-black">
        <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera view for scanning a barcode" />
        {state === "scanning" && !busy && (
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 border-2 border-lime shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" aria-hidden="true">
            <div className="pulse absolute inset-x-0 top-1/2 h-0.5 bg-lime" />
          </div>
        )}
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-xs font-semibold text-white" aria-live="polite">
          {busy
            ? "Looking it up…"
            : state === "starting"
              ? "Starting camera…"
              : state === "scanning"
                ? "Point at the barcode on the pack"
                : state === "nocamera"
                  ? "Camera not available. Use a photo or type the number."
                  : "Scanner couldn't start. Use a photo or type the number."}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="pop-btn ghost sm flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon.camera size={16} /> Photo of barcode
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void fromPhoto(f);
          }}
        />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = typed.replace(/\D/g, "");
          if (!valid(v)) return setMsg("Barcodes are 8 to 14 digits.");
          if (!done.current) {
            done.current = true;
            cb.current(v);
          }
        }}
      >
        <label className="field compact flex-1">
          <span>Or type the number</span>
          <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={16} placeholder="8901234567890" />
        </label>
        <button type="submit" className="pop-btn sm lime shrink-0 self-center" disabled={busy || !typed.trim()}>
          Look up
        </button>
      </form>
      {msg && (
        <p role="status" className="text-xs text-warn">
          {msg}
        </p>
      )}
    </div>
  );
}
