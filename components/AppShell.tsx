"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { AuthScreen } from "./AuthScreen";
import { ConfirmSheet } from "./ConfirmSheet";
import { Dock, FoodBar, TABS, Toast } from "./Dock";
import { Icon } from "./ui";

/** With accounts enabled, the app sits behind sign-in; in local-only mode it's always open. */
export function AppShell({ children }: { children: ReactNode }) {
  const { account } = useApp();
  if (account.configured && !account.ready) {
    return <p className="label pulse mx-auto max-w-[430px] px-5 pt-16">Loading…</p>;
  }
  if (account.configured && (!account.user || account.recovering)) return <AuthScreen />;
  return (
    <>
      <div className="lg:flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="mx-auto max-w-[430px] px-5 pb-[calc(var(--dock-h)+32px+env(safe-area-inset-bottom))] pt-4 lg:max-w-[1240px] lg:px-8 lg:pb-12 lg:pt-6">{children}</main>
        </div>
      </div>
      <Toast />
      <Dock />
      <ConfirmSheet />
    </>
  );
}

const initial = (name: string, email?: string) => (name || email || "?").trim()[0]?.toUpperCase() ?? "?";

function useSignOut() {
  const { signOut } = useApp();
  return () => {
    if (confirm("Sign out of Bite on this device? Your data stays in your account.")) void signOut();
  };
}

function SyncDot() {
  const { sync, account } = useApp();
  if (!account.configured) return null;
  const s =
    sync.status === "error"
      ? { c: "var(--over)", t: "Sync failed. Open Settings to retry." }
      : sync.status === "offline"
        ? { c: "var(--warn)", t: "Offline. Changes will sync later." }
        : sync.status === "syncing"
          ? { c: "var(--ink-3)", t: "Syncing…" }
          : { c: "var(--ok)", t: "Synced" };
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2" title={s.t}>
      <span className={`h-2 w-2 ${sync.status === "syncing" ? "pulse" : ""}`} style={{ background: s.c }} aria-hidden="true" />
      <span className="sr-only">{s.t}</span>
    </span>
  );
}

/** Phones: who's signed in + sign out. Desktop: the food bar lives here. */
function TopBar() {
  const { name, account } = useApp();
  const out = useSignOut();
  const who = name || account.user?.email.split("@")[0] || "";
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      {/* phone / tablet */}
      <div className="mx-auto flex h-14 max-w-[430px] items-center gap-3 px-5 lg:hidden">
        <Link href="/" className="plunk face-lime flex h-8 w-8 shrink-0 items-center justify-center text-base font-extrabold" style={{ ["--d" as string]: "3px" }} aria-label="Bite, today">
          b
        </Link>
        <Link href="/settings" className="min-w-0 flex-1" aria-label="Your profile and settings">
          <p className="label leading-none">{account.configured ? "Signed in" : "Bite"}</p>
          <p className="truncate text-sm font-bold">{who ? `Hi, ${who}` : "Hi there"}</p>
        </Link>
        <SyncDot />
        {account.configured && (
          <button onClick={out} className="flex h-10 items-center gap-1.5 border border-line px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-ink" aria-label="Sign out">
            <Icon.logout size={16} /> <span className="hidden min-[380px]:inline">Log out</span>
          </button>
        )}
      </div>
      {/* desktop */}
      <div className="mx-auto hidden max-w-[1240px] px-8 pb-2 pt-3 lg:block">
        <FoodBar variant="top" />
      </div>
    </header>
  );
}

function Sidebar() {
  const { name, account } = useApp();
  const pathname = usePathname();
  const out = useSignOut();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <Link href="/" className="flex items-center gap-3 px-5 pb-6 pt-6">
        <span className="plunk face-lime flex h-10 w-10 items-center justify-center text-xl font-extrabold" style={{ ["--d" as string]: "4px" }} aria-hidden="true">
          b
        </span>
        <span className="text-2xl font-extrabold tracking-tight">Bite</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1 px-3">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const I = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 px-3 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${active ? "bg-lime text-on-accent" : "text-ink-2 hover:bg-elevated hover:text-ink"}`}
            >
              <I size={18} />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line p-4">
        <Link href="/settings" className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-violet text-lg font-extrabold text-on-accent" aria-hidden="true">
            {initial(name, account.user?.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{name || "Add your name"}</span>
            {account.user && <span className="block truncate text-[11px] text-ink-3">{account.user.email}</span>}
          </span>
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <SyncDot />
          {account.configured && (
            <button onClick={out} className="flex h-9 items-center gap-1.5 border border-line px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-ink">
              <Icon.logout size={15} /> Log out
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
