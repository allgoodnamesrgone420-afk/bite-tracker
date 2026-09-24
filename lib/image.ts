"use client";

export type PreparedPhoto = { data: string; mediaType: "image/jpeg"; preview: string };

const MAX_EDGE = 1024;

/**
 * Downsize a camera photo to <=1024 px JPEG in the browser (respecting EXIF
 * rotation) so uploads stay small (~150-400 KB) and fast.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("not-an-image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    // Fallback for browsers without createImageBitmap options
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const w = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  const preview = canvas.toDataURL("image/jpeg", 0.82);
  return { data: preview.slice(preview.indexOf(",") + 1), mediaType: "image/jpeg", preview };
}
