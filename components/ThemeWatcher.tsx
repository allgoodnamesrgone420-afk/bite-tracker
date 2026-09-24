"use client";
import { useEffect } from "react";
import { applyTheme, getThemePref, watchSystemTheme } from "@/lib/theme";

/** Keeps data-theme in sync with the OS when the preference is "system". */
export function ThemeWatcher() {
  useEffect(() => {
    applyTheme(getThemePref());
    return watchSystemTheme();
  }, []);
  return null;
}
