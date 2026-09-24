"use client";
import { useEffect } from "react";

/** Registers the offline shell in production builds (dev HMR and SW caching don't mix). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* offline shell is a progressive enhancement */
    });
  }, []);
  return null;
}
