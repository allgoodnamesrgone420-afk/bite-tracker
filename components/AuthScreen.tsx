"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "./AppProvider";
import { Icon, PopButton } from "./ui";

type Mode = "signin" | "signup" | "forgot" | "sent-confirm" | "sent-reset";

const MIN_PASSWORD = 8;

/** Maps Supabase auth errors to plain language. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (m.includes("bite_not_invited") || m.includes("database error saving new user")) return "This email isn't on the invite list yet. Ask the owner to invite you.";
  if (m.includes("already registered") || m.includes("already been registered")) return "You already have an account. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password")) return message;
  return "Something went wrong. Check your connection and try again.";
}

export function AuthScreen() {
  const { account, online } = useApp();
  if (account.recovering) return <SetPassword />;
  return <SignIn online={online} />;
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-8">
      <span className="plunk face-lime flex h-14 w-14 items-center justify-center text-3xl font-extrabold" style={{ ["--d" as string]: "5px" }} aria-hidden="true">
        b
      </span>
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">Bite</h1>
      <p className="mt-1 text-ink-2">{subtitle}</p>
    </div>
  );
}

function SignIn({ online }: { online: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const sb = supabase();
    if (!sb || busy) return;
    setError(null);
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setError("Enter a valid email.");
    if (mode !== "forgot" && password.length < MIN_PASSWORD) return setError(`Passwords are at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: e, password });
        if (error) setError(friendly(error.message));
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: e, password, options: { emailRedirectTo: window.location.origin } });
        if (error) setError(friendly(error.message));
        else if (!data.session) setMode("sent-confirm");
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(e, { redirectTo: window.location.origin });
        if (error) setError(friendly(error.message));
        else setMode("sent-reset");
      }
    } finally {
      setBusy(false);
    }
  };

  if (mode === "sent-confirm" || mode === "sent-reset") {
    return (
      <Screen>
        <Brand subtitle="Check your email" />
        <div className="plunk face-card p-5">
          <p className="flex items-center gap-2 font-bold">
            <Icon.check size={18} /> {mode === "sent-confirm" ? "Almost there" : "Reset link sent"}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {mode === "sent-confirm"
              ? `We sent a confirmation link to ${email.trim()}. Open it on this device, then sign in.`
              : `If ${email.trim()} has an account, a reset link is on its way. Open it on this device to choose a new password.`}
          </p>
        </div>
        <button className="mt-6 text-sm font-bold uppercase tracking-[0.1em] text-ink-2 underline decoration-lime decoration-2 underline-offset-4" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      </Screen>
    );
  }

  const title = mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset password";
  return (
    <Screen>
      <Brand subtitle="Your food log, synced across every device." />
      {mode !== "forgot" && (
        <div className="segmented mb-5" role="tablist" aria-label="Account">
          <button role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>
            New account
          </button>
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-label={title}
      >
        <h2 className="sr-only">{title}</h2>
        {mode === "forgot" && <p className="text-sm text-ink-2">Enter your email and we&apos;ll send a link to set a new password.</p>}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== "forgot" && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD}
              required
            />
          </label>
        )}
        {mode === "signup" && <p className="text-xs text-ink-3">Accounts are invite-only. Use the email you were invited with.</p>}
        {error && (
          <p role="alert" className="flex items-start gap-2 border border-over/60 bg-over/10 p-3 text-sm">
            <span className="text-over">
              <Icon.alert size={16} />
            </span>
            {error}
          </p>
        )}
        {!online && <p className="text-sm text-warn">You&apos;re offline. Signing in needs a connection.</p>}
        <PopButton type="submit" variant="lime" block disabled={busy || !online}>
          {busy ? "One sec…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </PopButton>
      </form>
      <div className="mt-5 text-center">
        {mode === "forgot" ? (
          <button className="text-sm font-semibold text-ink-2 hover:text-ink" onClick={() => setMode("signin")}>
            Back to sign in
          </button>
        ) : (
          <button className="text-sm font-semibold text-ink-2 hover:text-ink" onClick={() => setMode("forgot")}>
            Forgot password?
          </button>
        )}
      </div>
    </Screen>
  );
}

function SetPassword() {
  const { finishRecovery } = useApp();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <Brand subtitle="Choose a new password" />
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < MIN_PASSWORD) return setError(`Passwords are at least ${MIN_PASSWORD} characters.`);
          setBusy(true);
          const { error } = (await supabase()?.auth.updateUser({ password })) ?? { error: null };
          setBusy(false);
          if (error) setError(friendly(error.message));
          else finishRecovery();
        }}
      >
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={MIN_PASSWORD} required />
        </label>
        {error && (
          <p role="alert" className="text-sm text-over">
            {error}
          </p>
        )}
        <PopButton type="submit" variant="lime" block disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </PopButton>
      </form>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center px-5 py-10">{children}</main>;
}
