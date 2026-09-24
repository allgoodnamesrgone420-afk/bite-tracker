"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon, PopButton, fmtInt } from "@/components/ui";
import { apiAIStatus, type AIStatus } from "@/lib/api-client";
import * as db from "@/lib/db";
import { supabase, syncConfigured } from "@/lib/supabase";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { ProfileSchema, type Profile, type TargetOverrides } from "@/lib/schemas";
import { computeTargets } from "@/lib/targets";

type Draft = Record<Exclude<keyof Profile, "adaptive">, string>;
const OVERRIDE_KEYS = ["calories", "protein_g", "carbs_g", "fat_g", "fibre_g"] as const;
const OVERRIDE_LABEL = { calories: "Calories", protein_g: "Protein g", carbs_g: "Carbs g", fat_g: "Fat g", fibre_g: "Fibre g" };

const toDraft = (p: Profile | null): Draft => ({
  age: p ? String(p.age) : "",
  sex: p?.sex ?? "female",
  heightCm: p ? String(p.heightCm) : "",
  weightKg: p ? String(p.weightKg) : "",
  activity: p?.activity ?? "light",
  goal: p?.goal ?? "lose",
  rateKgPerWeek: p ? String(p.rateKgPerWeek) : "0.5",
  diet: p?.diet ?? "",
  healthNotes: p?.healthNotes ?? "",
});

function parseDraft(d: Draft, adaptive: boolean) {
  return ProfileSchema.safeParse({
    ...d,
    adaptive,
    age: Number(d.age),
    heightCm: Number(d.heightCm),
    weightKg: Number(d.weightKg),
    rateKgPerWeek: d.goal === "maintain" ? 0 : Number(d.rateKgPerWeek),
  });
}

export default function SettingsPage() {
  const { ready, profile, overrides } = useApp();
  if (!ready) return <p className="label pulse pt-10">Loading…</p>;
  // Keyed so the form re-initialises after an import.
  return <SettingsForm key={JSON.stringify([profile, overrides])} profile={profile} overrides={overrides} />;
}

function SettingsForm({ profile, overrides }: { profile: Profile | null; overrides: TargetOverrides }) {
  const { saveSettings, reloadAll, adapt, tdee } = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [adaptive, setAdaptive] = useState(profile?.adaptive !== false);
  const [ov, setOv] = useState<Record<(typeof OVERRIDE_KEYS)[number], string>>(() =>
    Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, overrides[k] ? String(overrides[k]) : ""])) as Record<(typeof OVERRIDE_KEYS)[number], string>,
  );
  const [saved, setSaved] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const parsed = parseDraft(draft, adaptive);
  const overrideValues: TargetOverrides = useMemo(
    () => Object.fromEntries(OVERRIDE_KEYS.filter((k) => Number(ov[k]) > 0).map((k) => [k, Number(ov[k])])),
    [ov],
  );
  // Preview with your trend weight, and adaptive maintenance when it's switched on.
  const previewAdapt = adaptive && tdee?.ok ? { weightKg: adapt.weightKg, tdee: tdee.tdee, tdeeNote: adapt.tdeeNote ?? `${tdee.days} logged days, ${tdee.weighIns} weigh-ins` } : { weightKg: adapt.weightKg };
  const calc = parsed.success ? computeTargets(parsed.data, overrideValues, previewAdapt) : null;
  const fieldError = (k: keyof Draft) => (showErrors && !parsed.success ? parsed.error.issues.find((i) => i.path[0] === k)?.message : undefined);

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    setSaved(false);
  };

  return (
    <div className="space-y-6 pb-4">
      <header>
        <p className="label">Settings</p>
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">You &amp; your targets</h1>
      </header>

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
      <NameSection />
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setShowErrors(true);
          if (!parsed.success) return;
          await saveSettings(parsed.data, overrideValues);
          setSaved(true);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age" error={fieldError("age")}>
            <input inputMode="numeric" value={draft.age} onChange={set("age")} />
          </Field>
          <Field label="Sex (for BMR)">
            <select value={draft.sex} onChange={set("sex")}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>
          <Field label="Height (cm)" error={fieldError("heightCm")}>
            <input inputMode="decimal" value={draft.heightCm} onChange={set("heightCm")} />
          </Field>
          <Field label="Weight (kg)" error={fieldError("weightKg")}>
            <input inputMode="decimal" value={draft.weightKg} onChange={set("weightKg")} />
          </Field>
          {adapt.weightKg && (
            <p className="col-span-2 -mt-1 text-xs text-ink-2">
              Targets use your weigh-in trend (<span className="num font-semibold">{adapt.weightKg.toFixed(1)} kg</span>) instead. Log weight on the Progress tab.
            </p>
          )}
        </div>
        <Field label="Activity">
          <select value={draft.activity} onChange={set("activity")}>
            <option value="sedentary">Sedentary · desk job, little exercise</option>
            <option value="light">Light · exercise 1-3 days/week</option>
            <option value="moderate">Moderate · exercise 3-5 days/week</option>
            <option value="active">Active · hard exercise 6-7 days/week</option>
          </select>
        </Field>
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <Field label="Goal">
            <select value={draft.goal} onChange={set("goal")}>
              <option value="lose">Lose fat</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Gain muscle</option>
            </select>
          </Field>
          <Field label="Rate (kg/week)" error={fieldError("rateKgPerWeek")}>
            <input inputMode="decimal" value={draft.goal === "maintain" ? "0" : draft.rateKgPerWeek} onChange={set("rateKgPerWeek")} disabled={draft.goal === "maintain"} />
          </Field>
        </div>
        <Field label="Diet preferences & restrictions">
          <input value={draft.diet} maxLength={300} onChange={set("diet")} placeholder="e.g. vegetarian, no mushrooms, North Indian" />
        </Field>
        <Field label="Health notes (optional)">
          <input value={draft.healthNotes} maxLength={300} onChange={set("healthNotes")} placeholder="e.g. type 2 diabetes" />
        </Field>

        <label className="card flex cursor-pointer items-start gap-3 p-4">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--lime)]" checked={adaptive} onChange={(e) => (setAdaptive(e.target.checked), setSaved(false))} />
          <span>
            <span className="block font-bold">Adapt to my data</span>
            <span className="mt-0.5 block text-xs text-ink-2">
              Once you&apos;ve logged about 2 weeks and weighed in a few times, Bite estimates the maintenance calories you actually burn and uses that instead of the
              formula. Safety floors and the 1%/week cap still apply.
            </span>
            {tdee && (
              <span className={`mt-1.5 block text-xs font-semibold ${tdee.ok ? "text-ok" : "text-ink-3"}`}>
                {tdee.ok
                  ? `Your data says ~${fmtInt(tdee.fromData)} kcal/day maintenance (${tdee.confidence} confidence, ${tdee.days} days, ${tdee.weighIns} weigh-ins).`
                  : `Not enough data yet: needs ${tdee.need}.`}
              </span>
            )}
          </span>
        </label>

        {calc && (
          <section className="plunk face-card space-y-4 p-4" aria-live="polite">
            <div className="flex items-end justify-between">
              <div>
                <p className="label">Daily target</p>
                <p className="hero-num num mt-1 text-[56px]">{fmtInt(calc.targets.calories)}</p>
                <p className="text-sm text-ink-2">
                  kcal · maintenance {fmtInt(calc.tdee)}
                  {calc.adaptive && <span className="ml-1.5 tag text-ok">from your data</span>}
                </p>
              </div>
              <div className="num space-y-0.5 text-right text-sm font-semibold">
                <p className="text-protein">P {calc.targets.protein_g}g</p>
                <p className="text-carbs">C {calc.targets.carbs_g}g</p>
                <p className="text-fat">F {calc.targets.fat_g}g</p>
                <p className="text-fibre">Fibre {calc.targets.fibre_g}g</p>
              </div>
            </div>
            {calc.warnings.map((w) => (
              <p key={w} role="alert" className="flex gap-2 border border-warn/60 bg-warn/10 p-3 text-sm">
                <span className="text-warn">
                  <Icon.alert size={18} />
                </span>
                {w}
              </p>
            ))}
            <details className="group border-t border-line pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.1em]">
                How we calculated this
                <span className="text-ink-3 transition-transform group-open:rotate-180">
                  <Icon.chevron size={16} />
                </span>
              </summary>
              <ol className="mt-3 space-y-2">
                {calc.steps.map((s) => (
                  <li key={s.label} className="border-l-2 border-line pl-3">
                    <p className="flex justify-between gap-2 text-sm font-semibold">
                      {s.label} <span className="num">{s.value}</span>
                    </p>
                    <p className="num text-xs text-ink-2">{s.math}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-ink-2">
                Safety floors: never below 1,200 kcal (women) / 1,500 kcal (men); fat loss capped at 1% of body weight per week. General guidance, not medical advice.
              </p>
            </details>
          </section>
        )}

        <details className="card group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[0.1em]">
            Manual overrides
            <span className="text-ink-3 transition-transform group-open:rotate-180">
              <Icon.chevron size={16} />
            </span>
          </summary>
          <p className="mt-2 text-xs text-ink-2">Leave blank to use the calculated value. Calorie overrides still respect the safety floor.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {OVERRIDE_KEYS.map((k) => (
              <Field key={k} label={OVERRIDE_LABEL[k]} compact>
                <input
                  inputMode="decimal"
                  value={ov[k]}
                  placeholder="auto"
                  onChange={(e) => {
                    setOv((o) => ({ ...o, [k]: e.target.value.replace(/[^\d.]/g, "") }));
                    setSaved(false);
                  }}
                />
              </Field>
            ))}
          </div>
        </details>

        <PopButton type="submit" block>
          {saved ? (
            <>
              <Icon.check size={18} /> Saved
            </>
          ) : (
            "Save profile"
          )}
        </PopButton>
      </form>

      </div>
      <div className="space-y-6">
      {syncConfigured && <AccountSection />}
      {syncConfigured && <PeopleSection />}
      <AppearanceSection />
      <Link href="/foods" className="card flex items-center gap-3 p-4 hover:bg-elevated">
        <Icon.book size={20} />
        <span className="flex-1">
          <span className="block font-bold">My foods, meals &amp; recipes</span>
          <span className="block text-xs text-ink-2">Calibrated foods, saved meals and recipes live on the Foods tab.</span>
        </span>
        <Icon.right size={16} />
      </Link>
      <AISection />
      {!syncConfigured && <PasscodeSection />}
      <BackupSection onImported={reloadAll} />
      </div>
      </div>
    </div>
  );
}

function NameSection() {
  const { name, setName } = useApp();
  const [value, setValue] = useState(name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="card flex items-end gap-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await setName(value);
        setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.message ?? "Couldn't save." });
      }}
    >
      <div className="flex-1">
        <label className="field compact">
          <span>Your name</span>
          <input value={value} maxLength={40} autoComplete="given-name" onChange={(e) => (setValue(e.target.value), setMsg(null))} placeholder="What should Bite call you?" />
        </label>
        {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-ok" : "text-over"}`} role="status">{msg.text}</p>}
      </div>
      <button type="submit" className="pop-btn sm lime shrink-0" disabled={value.trim() === name}>
        Save
      </button>
    </form>
  );
}

function Field({ label, error, compact, children }: { label: string; error?: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={`field ${compact ? "compact" : ""}`}>
        <span>{label}</span>
        {children}
      </label>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-over">
          <Icon.alert size={12} /> {error}
        </p>
      )}
    </div>
  );
}

function AccountSection() {
  const { account, sync, syncNow, signOut } = useApp();
  const [busy, setBusy] = useState(false);
  const status =
    sync.status === "syncing"
      ? { text: "Syncing…", cls: "text-ink-2" }
      : sync.status === "error"
        ? { text: `Sync failed: ${sync.error ?? "unknown error"}`, cls: "text-over" }
        : sync.status === "offline"
          ? { text: "Offline. Changes will sync when you're back.", cls: "text-warn" }
          : sync.lastSyncedAt
            ? { text: `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`, cls: "text-ok" }
            : { text: "Waiting to sync", cls: "text-ink-2" };
  return (
    <section className="plunk face-card space-y-3 p-4">
      <div>
        <p className="label">Account</p>
        <p className="mt-1 truncate font-bold">{account.user?.email}</p>
        <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${status.cls}`} role="status" aria-live="polite">
          {sync.status === "error" ? <Icon.alert size={13} /> : sync.status === "idle" ? <Icon.check size={13} /> : null}
          {status.text}
        </p>
        <p className="mt-2 text-xs text-ink-2">Your log, profile and foods sync to your account, so every device you sign in on shows the same data.</p>
      </div>
      <div className="flex gap-3">
        <PopButton
          variant="ghost"
          size="sm"
          disabled={busy || sync.status === "syncing"}
          onClick={async () => {
            setBusy(true);
            await syncNow();
            setBusy(false);
          }}
        >
          Sync now
        </PopButton>
        <PopButton variant="ghost" size="sm" onClick={() => void signOut()}>
          <Icon.logout size={14} /> Sign out
        </PopButton>
      </div>
      <ChangePassword />
    </section>
  );
}

function ChangePassword() {
  const { changePassword } = useApp();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) {
    return (
      <button className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2 underline decoration-lime decoration-2 underline-offset-4 hover:text-ink" onClick={() => setOpen(true)}>
        Change password
      </button>
    );
  }
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next.length < 8) return setMsg({ ok: false, text: "New password needs at least 8 characters." });
        if (next !== confirmNext) return setMsg({ ok: false, text: "The new passwords don't match." });
        setBusy(true);
        const r = await changePassword(current, next);
        setBusy(false);
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) {
          setCurrent("");
          setNext("");
          setConfirmNext("");
        }
      }}
    >
      <p className="label">Change password</p>
      <label className="field compact">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field compact">
        <span>New password (8+ characters)</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
      </label>
      <label className="field compact">
        <span>Repeat new password</span>
        <input type="password" autoComplete="new-password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} minLength={8} required />
      </label>
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-ok" : "text-over"}`}>
          {msg.text}
        </p>
      )}
      <div className="flex gap-3">
        <PopButton type="submit" variant="lime" size="sm" disabled={busy || !current || !next}>
          {busy ? "Saving…" : "Update password"}
        </PopButton>
        <PopButton variant="ghost" size="sm" onClick={() => (setOpen(false), setMsg(null))}>
          Cancel
        </PopButton>
      </div>
    </form>
  );
}

const PROVIDER_NAME: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  xai: "xAI",
  mistral: "Mistral",
  compatible: "OpenAI-compatible",
};

function AISection() {
  const [status, setStatus] = useState<AIStatus | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    apiAIStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="card space-y-2 p-4">
      <p className="label">AI</p>
      {status === undefined ? (
        <p className="pulse text-sm text-ink-3">Checking…</p>
      ) : !status ? (
        <p className="text-sm text-ink-2">Couldn&apos;t reach the server.</p>
      ) : status.configured ? (
        <>
          <p className="font-bold">
            {PROVIDER_NAME[status.provider ?? ""] ?? status.provider}
            {status.effort && <span className="ml-2 tag text-ink-2">{status.effort} effort</span>}
          </p>
          <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-ink-3">Text</dt>
            <dd className="truncate">{status.models?.parse}</dd>
            <dt className="text-ink-3">Photos</dt>
            <dd className="truncate">{status.models?.vision}</dd>
            <dt className="text-ink-3">Coach</dt>
            <dd className="truncate">{status.models?.coach}</dd>
          </dl>
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-sm text-warn">
          <Icon.alert size={14} /> Not set up: {status.problem}. The food library and built-in coach still work.
        </p>
      )}
      <p className="text-xs text-ink-3">Switch providers by changing LLM_API_KEY (and LLM_PROVIDER / LLM_MODEL if needed) in Vercel, then redeploy.</p>
    </section>
  );
}

type Invite = { email: string; role: "owner" | "member"; created_at: string };

function PeopleSection() {
  const { account } = useApp();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const me = account.user?.email.toLowerCase() ?? "";

  const load = async () => {
    const res = await supabase()?.from("allowed_emails").select("email,role,created_at").order("created_at");
    if (res && !res.error) setInvites(res.data as Invite[]);
  };
  useEffect(() => {
    let live = true;
    supabase()
      ?.from("allowed_emails")
      .select("email,role,created_at")
      .order("created_at")
      .then((res) => live && !res.error && setInvites(res.data as Invite[]));
    return () => {
      live = false;
    };
  }, []);

  // RLS only returns other people's rows to the owner; members see just themselves.
  const isOwner = invites?.some((i) => i.email === me && i.role === "owner");
  if (!isOwner) return null;

  return (
    <section className="card space-y-3 p-4">
      <div>
        <p className="label">People</p>
        <p className="mt-1 text-xs text-ink-2">
          Only invited emails can create an account. Invite someone, then send them the link: they sign up with that email and get their own private log.
        </p>
      </div>
      <ul className="divide-y divide-line-soft border-y border-line-soft">
        {invites!.map((i) => (
          <li key={i.email} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.email}</span>
            {i.role === "owner" ? (
              <span className="tag text-ok">Owner</span>
            ) : (
              <button
                className="flex h-9 w-9 items-center justify-center text-ink-3 hover:text-over"
                aria-label={`Remove ${i.email}`}
                onClick={async () => {
                  if (!confirm(`Remove ${i.email}? They'll lose access to sync and AI features.`)) return;
                  const res = await supabase()?.from("allowed_emails").delete().eq("email", i.email);
                  setMsg(res?.error ? { ok: false, text: "Couldn't remove that invite." } : { ok: true, text: `Removed ${i.email}.` });
                  await load();
                }}
              >
                <Icon.trash size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = email.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setMsg({ ok: false, text: "Enter a valid email." });
          const res = await supabase()?.from("allowed_emails").insert({ email: v, role: "member", invited_by: me });
          if (res?.error) setMsg({ ok: false, text: res.error.code === "23505" ? "Already invited." : "Couldn't add that invite." });
          else {
            setMsg({ ok: true, text: `Invited ${v}. Send them ${window.location.origin}` });
            setEmail("");
            await load();
          }
        }}
      >
        <label className="field compact flex-1">
          <span>Invite by email</span>
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="pop-btn sm lime shrink-0 self-center" disabled={!email.trim()}>
          Invite
        </button>
      </form>
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-ok" : "text-over"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

const subscribeTheme = (cb: () => void) => {
  window.addEventListener("bite-theme", cb);
  return () => window.removeEventListener("bite-theme", cb);
};

function AppearanceSection() {
  const pref = useSyncExternalStore(subscribeTheme, getThemePref, () => "system" as ThemePref);
  const options: { v: ThemePref; label: string }[] = [
    { v: "system", label: "System" },
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
  ];
  return (
    <section className="card space-y-3 p-4">
      <p className="label">Appearance</p>
      <div className="segmented" role="group" aria-label="Theme">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={pref === o.v}
            onClick={() => setThemePref(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PasscodeSection() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    void db.getPasscode().then((p) => p && setCode(p));
  }, []);
  return (
    <section className="card space-y-3 p-4">
      <div>
        <p className="label">App passcode</p>
        <p className="mt-1 text-xs text-ink-2">Only needed if the server sets APP_PASSCODE. Stored on this device.</p>
      </div>
      <div className="flex gap-2">
        <label className="field compact flex-1">
          <span>Passcode</span>
          <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <PopButton
          variant="ghost"
          onClick={async () => {
            await db.savePasscode(code);
            setStatus(code ? "Saved" : "Cleared");
          }}
        >
          Save
        </PopButton>
      </div>
      {status && <p className="text-xs text-ok" role="status">{status}</p>}
    </section>
  );
}

function BackupSection({ onImported }: { onImported: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="card space-y-3 p-4">
      <div>
        <p className="label">Backup</p>
        <p className="mt-1 text-xs text-ink-2">
          {syncConfigured ? "Your data is safely in your account. Export a JSON copy any time." : "Everything lives in this browser. Export a JSON file now and then."}
        </p>
      </div>
      <div className="flex gap-3">
        <PopButton
          variant="ghost"
          block
          onClick={async () => {
            const data = await db.exportAll();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `bite-backup-${data.exportedAt.slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setMsg({ ok: true, text: `Exported ${data.days.length} day${data.days.length === 1 ? "" : "s"}.` });
          }}
        >
          Export
        </PopButton>
        <PopButton variant="ghost" block onClick={() => fileRef.current?.click()}>
          Import
        </PopButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import backup file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const msg = syncConfigured
              ? "Import this backup into your account? Its entries are added and synced; anything already in your account stays."
              : "Importing replaces all data on this device. Continue?";
            if (!confirm(msg)) return;
            try {
              const { days } = await db.importAll(JSON.parse(await file.text()));
              await onImported();
              setMsg({ ok: true, text: `Imported ${days} day${days === 1 ? "" : "s"}.` });
            } catch {
              setMsg({ ok: false, text: "That file isn't a valid Bite backup." });
            }
          }}
        />
      </div>
      {msg && (
        <p role="status" className={`text-xs ${msg.ok ? "text-ok" : "text-over"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
