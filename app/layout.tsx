import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { Dock, Toast } from "@/components/Dock";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ThemeWatcher } from "@/components/ThemeWatcher";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Bite",
  description: "Log food in plain language or with a photo. Track calories and macros against your goals.",
  applicationName: "Bite",
  appleWebApp: { capable: true, title: "Bite", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint so there's no flash of the wrong theme.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("bite-theme");var t=p==="light"||p==="dark"?p:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sora.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeWatcher />
        <ServiceWorker />
        <AppProvider>
          <main className="mx-auto min-h-dvh max-w-[430px] px-5 pb-[calc(var(--dock-h)+32px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
            {children}
          </main>
          <Toast />
          <Dock />
          <ConfirmSheet />
        </AppProvider>
      </body>
    </html>
  );
}
