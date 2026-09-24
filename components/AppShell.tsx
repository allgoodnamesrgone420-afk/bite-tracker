"use client";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { AuthScreen } from "./AuthScreen";
import { ConfirmSheet } from "./ConfirmSheet";
import { Dock, Toast } from "./Dock";

/** With accounts enabled, the app sits behind sign-in; in local-only mode it's always open. */
export function AppShell({ children }: { children: ReactNode }) {
  const { account } = useApp();
  if (account.configured && !account.ready) {
    return <p className="label pulse mx-auto max-w-[430px] px-5 pt-16">Loading…</p>;
  }
  if (account.configured && (!account.user || account.recovering)) return <AuthScreen />;
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-[430px] px-5 pb-[calc(var(--dock-h)+32px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        {children}
      </main>
      <Toast />
      <Dock />
      <ConfirmSheet />
    </>
  );
}
