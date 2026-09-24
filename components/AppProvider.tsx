"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiParse, apiParsePhoto } from "@/lib/api-client";
import { preparePhoto } from "@/lib/image";
import { applyCalibration, itemFromPersonal, learnFoods, nutrientsOf, personalAsFoods, type Origin, type PersonalFood } from "@/lib/calibration";
import { localCorrection } from "@/lib/corrections";
import * as db from "@/lib/db";
import type { DaySummary } from "@/lib/db";
import { localParse, type LocalParse } from "@/lib/local-parser";
import { LogItemSchema, ParsedItemSchema, type ApiErrorCode, type DayLog, type LogItem, type Meal, type ParsedItem, type ParseRequest, type Profile, type TargetOverrides } from "@/lib/schemas";
import { supabase, syncConfigured } from "@/lib/supabase";
import { syncNow } from "@/lib/sync";
import { computeTargets, type TargetCalc } from "@/lib/targets";
import { dateKey, mealForTime, sumItems } from "@/lib/totals";

export type DraftItem = ParsedItem & {
  key: string;
  source: "llm" | "manual";
  /** Values as parsed, so we can tell whether you calibrated them. */
  origin?: Origin;
  /** Row the parser couldn't identify; needs your numbers. */
  needsInput?: boolean;
};

export type Engine = "local" | "llm" | "cache" | "manual";

export type Sheet =
  | { kind: "closed" }
  | { kind: "review"; text: string; rows: DraftItem[]; engine: Engine; notice?: string; photo?: string }
  | { kind: "clarify"; text: string; question: string; answers: string[]; photo?: string }
  | { kind: "error"; text: string; code: ApiErrorCode; message: string; retry?: ParseRequest }
  | { kind: "passcode"; retry: ParseRequest }
  | { kind: "nonfood"; text: string }
  | { kind: "edit"; item: LogItem };

export type CorrectionResult = { ok: true; items: ParsedItem[]; notice?: string } | { ok: false; message: string };

type Pending = { text: string; meal: Meal; photo?: string };

export type Account = {
  /** Supabase connected on this deployment (otherwise local-only mode). */
  configured: boolean;
  ready: boolean;
  user: { id: string; email: string } | null;
  /** Arrived via a password-reset link: show "set new password". */
  recovering: boolean;
};
export type SyncState = { status: "off" | "idle" | "syncing" | "error" | "offline"; lastSyncedAt: number | null; error?: string };
type Toast = { message: string; undo?: () => void; id: number };

type AppState = {
  ready: boolean;
  online: boolean;
  today: string;
  day: DayLog;
  summaries: Record<string, DaySummary>;
  profile: Profile | null;
  overrides: TargetOverrides;
  calc: TargetCalc | null;
  myFoods: Record<string, PersonalFood>;
  pending: Pending | null;
  sheet: Sheet;
  toast: Toast | null;
  submitText: (text: string) => void;
  submitPhoto: (file: File, note?: string) => void;
  answerClarification: (answer: string) => void;
  skipClarification: () => void;
  retry: (req: ParseRequest) => void;
  openManual: (name?: string) => void;
  setSheet: (s: Sheet) => void;
  commitRows: (rows: DraftItem[]) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  saveSettings: (p: Profile, o: TargetOverrides) => Promise<void>;
  submitPasscode: (code: string, retry: ParseRequest) => Promise<void>;
  forgetFood: (key: string) => Promise<void>;
  updateItem: (id: string, rows: DraftItem[]) => Promise<void>;
  correctItem: (item: ParsedItem, text: string) => Promise<CorrectionResult>;
  quickAdd: (key: string) => void;
  repeatItems: (items: LogItem[], label: string, meal?: Meal) => void;
  reloadAll: () => Promise<void>;
  dismissToast: () => void;
  account: Account;
  sync: SyncState;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
  finishRecovery: () => void;
};

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
};

const localTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const uid = () => crypto.randomUUID();

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

async function loadSnapshot() {
  const date = dateKey();
  const [profile, overrides, day, summaries, myFoods] = await Promise.all([
    db.getProfile(),
    db.getOverrides(),
    db.getDay(date),
    db.getSummaries(),
    db.getMyFoods(),
  ]);
  return { profile: profile ?? null, overrides, day, summaries, myFoods };
}

export const blankRow = (name = "", meal: Meal = mealForTime(), needsInput = false): DraftItem => ({
  key: uid(),
  source: "manual",
  name,
  quantity: 1,
  unit: "serving",
  meal,
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fibre_g: 0,
  confidence: "medium",
  assumed: false,
  notes: "",
  needsInput,
});

const toRows = (items: ParsedItem[]): DraftItem[] =>
  items.map((i) => ({ ...i, key: uid(), source: "llm", origin: { quantity: i.quantity, n: nutrientsOf(i) } }));

/** Local result plus a blank row for each part nobody could identify. */
const localRows = (local: LocalParse): DraftItem[] => [
  ...toRows(local.items),
  ...local.unknown.map((u) => blankRow(u.slice(0, 80), local.items[0]?.meal ?? mealForTime(), true)),
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [day, setDay] = useState<DayLog>(() => ({ date: dateKey(), items: [] }));
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [overrides, setOverrides] = useState<TargetOverrides>({});
  const [myFoods, setMyFoods] = useState<Record<string, PersonalFood>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [sheet, setSheet] = useState<Sheet>({ kind: "closed" });
  const [toast, setToast] = useState<Toast | null>(null);
  const [account, setAccount] = useState<Account>({ configured: syncConfigured, ready: !syncConfigured, user: null, recovering: false });
  const [sync, setSync] = useState<SyncState>({ status: "off", lastSyncedAt: null });
  const today = day.date;

  const calc = useMemo(() => (profile ? computeTargets(profile, overrides) : null), [profile, overrides]);

  // Refs let async callbacks read the latest state without re-creating themselves.
  const dayRef = useRef(day);
  const foodsRef = useRef(myFoods);
  const calcRef = useRef(calc);
  useEffect(() => {
    dayRef.current = day;
    foodsRef.current = myFoods;
    calcRef.current = calc;
  }, [day, myFoods, calc]);

  const applySnapshot = useCallback((snap: Awaited<ReturnType<typeof loadSnapshot>>) => {
    setProfile(snap.profile);
    setOverrides(snap.overrides);
    setDay(snap.day);
    setSummaries(snap.summaries);
    setMyFoods(snap.myFoods);
    setReady(true);
  }, []);

  const reloadAll = useCallback(() => loadSnapshot().then(applySnapshot), [applySnapshot]);

  useEffect(() => {
    let live = true;
    loadSnapshot().then((snap) => live && applySnapshot(snap));
    // Midnight rollover: re-check the date when the tab regains focus and once a minute.
    const tick = () => {
      if (dateKey() !== dayRef.current.date) loadSnapshot().then((snap) => live && applySnapshot(snap));
    };
    const interval = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [applySnapshot]);

  /* ------------------------------ account & sync ------------------------------ */

  // Track the Supabase session. (No Supabase calls inside the callback: the SDK warns against it.)
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const toUser = (u: { id: string; email?: string } | null | undefined) => (u ? { id: u.id, email: u.email ?? "" } : null);
    sb.auth.getSession().then(({ data }) => setAccount((a) => ({ ...a, ready: true, user: toUser(data.session?.user) })));
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      setAccount((a) => ({
        ...a,
        ready: true,
        user: toUser(session?.user),
        recovering: event === "PASSWORD_RECOVERY" ? true : event === "SIGNED_OUT" ? false : a.recovering,
      }));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = account.user?.id ?? null;
  const [deviceReady, setDeviceReady] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    const sb = supabase();
    if (!sb || !userId || deviceReady !== userId) return;
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, status: "offline" }));
      return;
    }
    setSync((s) => ({ ...s, status: "syncing" }));
    try {
      const r = await syncNow(sb, userId);
      if (r.changedLocal) await reloadAll();
      setSync({ status: "idle", lastSyncedAt: Date.now() });
    } catch (e) {
      setSync((s) => ({ ...s, status: "error", error: (e as Error).message.slice(0, 160) }));
    }
  }, [userId, deviceReady, reloadAll]);

  // Signing in on this device: data from a different account is wiped; data made
  // before any account existed is uploaded to this one.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      const meta = await db.getSyncMeta();
      if (meta.owner && meta.owner !== userId) await db.clearLocal();
      if (meta.owner !== userId) {
        const hadData = meta.owner === null;
        await db.setSyncOwner(userId);
        if (hadData) await db.queueAllLocal();
        await reloadAll();
      }
      if (live) setDeviceReady(userId);
    })();
    return () => {
      live = false;
    };
  }, [userId, reloadAll]);

  // When to sync: once ready, after local edits (debounced), on focus, when back online, every minute.
  useEffect(() => {
    if (!userId || deviceReady !== userId) return;
    void runSync();
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => void runSync(), 1_500);
    };
    const off = db.onLocalChange(soon);
    const onVisible = () => document.visibilityState === "visible" && void runSync();
    const onOnline = () => void runSync();
    const onOffline = () => setSync((s) => ({ ...s, status: "offline" }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => document.visibilityState === "visible" && void runSync(), 60_000);
    return () => {
      clearTimeout(t);
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [userId, deviceReady, runSync]);

  const signOut = useCallback(async () => {
    const sb = supabase();
    if (!sb) return;
    const out = await db.getOutbox();
    const unsynced = Object.keys(out.items).length + Object.keys(out.foods).length + out.profile;
    if (unsynced && navigator.onLine) await runSync();
    const left = await db.getOutbox();
    const stillUnsynced = Object.keys(left.items).length + Object.keys(left.foods).length + left.profile;
    if (stillUnsynced && !confirm(`${stillUnsynced} change(s) haven't synced yet and will be lost if you sign out now. Sign out anyway?`)) return;
    await sb.auth.signOut();
    await db.clearLocal(); // your data stays safe in your account
    setDeviceReady(null);
    setSync({ status: "off", lastSyncedAt: null });
    await reloadAll();
  }, [runSync, reloadAll]);

  const finishRecovery = useCallback(() => setAccount((a) => ({ ...a, recovering: false })), []);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo, id: Date.now() });
  }, []);

  /**
   * Parse pipeline: food library + your saved foods (instant, free, offline)
   * → parse cache → AI for anything unrecognised → library fallback if the AI
   * is unavailable (no key, offline, error).
   */
  const runParse = useCallback(async (req: ParseRequest) => {
    const plain = !req.clarification && !req.skipClarification && !req.correction;
    const foods = foodsRef.current;
    const local = plain ? localParse(req.text, personalAsFoods(foods)) : null;

    if (local?.complete) {
      setSheet({ kind: "review", text: req.text, rows: toRows(local.items), engine: "local" });
      return;
    }

    const cacheKey = `${db.normaliseText(req.text)}|${mealForTime()}`;
    if (plain) {
      const cached = await db.getCachedParse(cacheKey);
      if (cached?.items.length) {
        setSheet({ kind: "review", text: req.text, rows: toRows(applyCalibration(cached.items, foods)), engine: "cache" });
        return;
      }
    }

    const hasLocal = !!local && (local.items.length > 0 || local.unknown.length > 0);
    const fallback = (notice: string) => setSheet({ kind: "review", text: req.text, rows: localRows(local!), engine: "local", notice });

    if (!navigator.onLine) {
      if (hasLocal) fallback("Offline, so this came from your food library. Fill in anything it didn't know.");
      else setSheet({ kind: "error", text: req.text, code: "offline", message: "You're offline. Add it manually for now." });
      return;
    }

    setSheet({ kind: "closed" });
    setPending({ text: req.text, meal: mealForTime() });
    const res = await apiParse(req);
    setPending(null);

    if (!res.ok) {
      if (res.error.code === "unauthorized" && !syncConfigured) setSheet({ kind: "passcode", retry: req });
      else if (hasLocal) {
        fallback(
          res.error.code === "config"
            ? "No AI key set, so this came from the built-in food library. Fill in anything it didn't recognise."
            : `${res.error.message} Used your food library instead.`,
        );
      } else setSheet({ kind: "error", text: req.text, code: res.error.code, message: res.error.message, retry: req });
      return;
    }
    const r = res.data;
    if (r.items.length) {
      if (plain) void db.setCachedParse(cacheKey, { items: r.items, needs_clarification: null, suggested_answers: [] });
      setSheet({ kind: "review", text: req.text, rows: toRows(applyCalibration(r.items, foods)), engine: "llm" });
    } else if (r.needs_clarification) {
      setSheet({ kind: "clarify", text: req.text, question: r.needs_clarification, answers: r.suggested_answers });
    } else {
      setSheet({ kind: "nonfood", text: req.text });
    }
  }, []);

  const baseReq = useCallback(
    (text: string): ParseRequest => ({ text, localTime: localTime(), diet: profile?.diet || undefined }),
    [profile],
  );

  const submitText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (t) void runParse(baseReq(t));
    },
    [runParse, baseReq],
  );

  /** Photo → vision model → same confirm sheet. Needs the AI; there's no offline fallback for images. */
  const lastPhoto = useRef<{ data: string; preview: string; note?: string } | null>(null);
  const runPhoto = useCallback(
    async (photo: { data: string; preview: string }, note?: string, clarification?: string) => {
      const noteText = [note, clarification].filter(Boolean).join(". ").slice(0, 200) || undefined;
      if (!navigator.onLine) {
        setSheet({ kind: "error", text: note ?? "Photo", code: "offline", message: "Photo breakdown needs a connection. Add it manually for now." });
        return;
      }
      setSheet({ kind: "closed" });
      setPending({ text: note ? `Photo · ${note}` : "Analysing your photo", meal: mealForTime(), photo: photo.preview });
      const res = await apiParsePhoto({ image: photo.data, mediaType: "image/jpeg", note: noteText, localTime: localTime(), diet: profile?.diet || undefined });
      setPending(null);
      if (!res.ok) {
        setSheet({ kind: "error", text: note ?? "Photo", code: res.error.code, message: res.error.message });
        return;
      }
      const r = res.data;
      if (r.items.length) {
        setSheet({ kind: "review", text: note ?? "", rows: toRows(applyCalibration(r.items, foodsRef.current)), engine: "llm", photo: photo.preview });
      } else if (r.needs_clarification) {
        setSheet({ kind: "clarify", text: note ?? "Photo", question: r.needs_clarification, answers: r.suggested_answers, photo: photo.preview });
      } else {
        setSheet({ kind: "nonfood", text: note ?? "That photo" });
      }
    },
    [profile],
  );

  const submitPhoto = useCallback(
    (file: File, note?: string) => {
      void (async () => {
        try {
          const p = await preparePhoto(file);
          lastPhoto.current = { data: p.data, preview: p.preview, note };
          await runPhoto(p, note);
        } catch {
          setSheet({ kind: "error", text: "Photo", code: "bad_request", message: "Couldn't read that image. Try another photo, or add it manually." });
        }
      })();
    },
    [runPhoto],
  );

  const answerClarification = useCallback(
    (answer: string) => {
      if (sheet.kind !== "clarify") return;
      if (sheet.photo && lastPhoto.current) {
        void runPhoto(lastPhoto.current, lastPhoto.current.note, `${sheet.question} ${answer.slice(0, 100)}`);
        return;
      }
      void runParse({ ...baseReq(sheet.text), clarification: { question: sheet.question, answer: answer.slice(0, 100) } });
    },
    [sheet, runParse, runPhoto, baseReq],
  );

  const skipClarification = useCallback(() => {
    if (sheet.kind !== "clarify") return;
    if (sheet.photo && lastPhoto.current) {
      void runPhoto(lastPhoto.current, lastPhoto.current.note, "Just give your best estimate of a typical portion");
      return;
    }
    void runParse({ ...baseReq(sheet.text), skipClarification: true });
  }, [sheet, runParse, runPhoto, baseReq]);

  const retry = useCallback((req: ParseRequest) => void runParse(req), [runParse]);

  const openManual = useCallback((name = "") => {
    setSheet({ kind: "review", text: name, rows: [blankRow(name.slice(0, 80))], engine: "manual" });
  }, []);

  const persistDay = useCallback(async (next: DayLog) => {
    setDay(next);
    setSummaries(await db.saveDay(next, calcRef.current?.targets));
  }, []);

  const commitRows = useCallback(
    async (rows: DraftItem[]) => {
      const now = Date.now();
      const valid = rows.filter((r) => r.name.trim());
      // Schema parse strips draft-only fields and re-validates edited values.
      const items: LogItem[] = valid.map((r) =>
        LogItemSchema.parse({ ...r, name: r.name.trim(), unit: r.unit.trim() || "serving", id: uid(), createdAt: now }),
      );
      if (!items.length) return;
      const current = await db.getDay(dateKey());
      await persistDay({ ...current, items: [...current.items, ...items] });
      // Remember every food; hand-edited numbers become your calibrated values.
      const learned = learnFoods(foodsRef.current, valid);
      setMyFoods(learned);
      void db.saveMyFoods(learned);
      setSheet({ kind: "closed" });
      const t = sumItems(items);
      showToast(`Logged ${items.length} item${items.length > 1 ? "s" : ""} · ${t.calories.toLocaleString("en-IN")} kcal`);
    },
    [persistDay, showToast],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const before = dayRef.current;
      const removed = before.items.find((i) => i.id === id);
      if (!removed) return;
      await persistDay({ ...before, items: before.items.filter((i) => i.id !== id) });
      showToast(`Removed ${removed.name}`, () => {
        const cur = dayRef.current;
        void persistDay({ ...cur, items: [...cur.items, removed].sort((a, b) => a.createdAt - b.createdAt) });
      });
    },
    [persistDay, showToast],
  );

  const saveSettings = useCallback(async (p: Profile, o: TargetOverrides) => {
    await Promise.all([db.saveProfile(p), db.saveOverrides(o)]);
    setProfile(p);
    setOverrides(o);
  }, []);

  const submitPasscode = useCallback(
    async (code: string, req: ParseRequest) => {
      await db.savePasscode(code);
      void runParse(req);
    },
    [runParse],
  );

  /** Replace a logged item with edited row(s); edited numbers calibrate the food. */
  const updateItem = useCallback(
    async (id: string, rows: DraftItem[]) => {
      const before = dayRef.current;
      const idx = before.items.findIndex((i) => i.id === id);
      if (idx === -1) return;
      const old = before.items[idx];
      const valid = rows.filter((r) => r.name.trim());
      const replaced: LogItem[] = valid.map((r, k) =>
        LogItemSchema.parse({ ...r, name: r.name.trim(), unit: r.unit.trim() || "serving", id: k === 0 ? id : uid(), createdAt: old.createdAt, source: r.source }),
      );
      const items = [...before.items.slice(0, idx), ...replaced, ...before.items.slice(idx + 1)];
      await persistDay({ ...before, items });
      const learned = learnFoods(foodsRef.current, valid);
      setMyFoods(learned);
      void db.saveMyFoods(learned);
      setSheet({ kind: "closed" });
      showToast(replaced.length ? `Updated ${replaced[0].name}` : `Removed ${old.name}`, () => {
        const cur = dayRef.current;
        void persistDay({ ...cur, items: before.items });
      });
    },
    [persistDay, showToast],
  );

  /** "That was 1 tbsp of oil, not 3" → AI correction, with a conservative offline fallback. */
  const correctItem = useCallback(
    async (item: ParsedItem, text: string): Promise<CorrectionResult> => {
      const fallback = (why: string): CorrectionResult => {
        const local = localCorrection(item, text, personalAsFoods(foodsRef.current));
        return local
          ? { ok: true, items: [local], notice: `${why} Applied it with the food library.` }
          : { ok: false, message: `${why} Corrections like this need the AI. Edit the numbers directly instead.` };
      };
      if (!navigator.onLine) return fallback("You're offline.");
      const res = await apiParse({ text: item.name, localTime: localTime(), diet: profile?.diet || undefined, correction: { item, text } });
      if (!res.ok) {
        if (res.error.code === "config") return fallback("No AI key set.");
        if (res.error.code === "unauthorized") return { ok: false, message: res.error.message };
        return fallback(res.error.message);
      }
      if (!res.data.items.length) return { ok: false, message: "Couldn't apply that correction. Edit the numbers directly." };
      return { ok: true, items: res.data.items.map((i) => ({ ...i, meal: item.meal })) };
    },
    [profile],
  );

  const quickAdd = useCallback((key: string) => {
    const p = foodsRef.current[key];
    if (!p) return;
    setSheet({ kind: "review", text: "", rows: toRows([itemFromPersonal(p, mealForTime())]), engine: "cache" });
  }, []);

  const repeatItems = useCallback((items: LogItem[], label: string, meal?: Meal) => {
    // Schema parse drops the stored id/createdAt/source.
    const parsed: ParsedItem[] = items.map((i) => ParsedItemSchema.parse({ ...i, meal: meal ?? i.meal }));
    setSheet({ kind: "review", text: label, rows: toRows(parsed), engine: "cache" });
  }, []);

  const forgetFood = useCallback(async (key: string) => {
    const next = { ...foodsRef.current };
    delete next[key];
    setMyFoods(next);
    await db.saveMyFoods(next);
  }, []);

  const value: AppState = {
    ready,
    online,
    today,
    day,
    summaries,
    profile,
    overrides,
    calc,
    myFoods,
    pending,
    sheet,
    toast,
    submitText,
    submitPhoto,
    answerClarification,
    skipClarification,
    retry,
    openManual,
    setSheet,
    commitRows,
    deleteItem,
    saveSettings,
    submitPasscode,
    forgetFood,
    updateItem,
    correctItem,
    quickAdd,
    repeatItems,
    reloadAll,
    dismissToast,
    account,
    sync,
    syncNow: runSync,
    signOut,
    finishRecovery,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
