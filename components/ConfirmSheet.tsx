"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { foodKey, nutrientsOf } from "@/lib/calibration";
import { perServing } from "@/lib/library";
import { scaleMicros } from "@/lib/micros";
import { MEALS, ParsedItemSchema, type ApiErrorCode, type LogItem, type Meal, type ParsedItem } from "@/lib/schemas";
import { MEAL_STYLE } from "@/lib/meal-style";
import { mealForTime, sumItems } from "@/lib/totals";
import { blankRow, useApp, type DraftItem, type Engine, type Sheet } from "./AppProvider";
import { BarcodeScanner } from "./BarcodeScanner";
import { ConfidenceDot, Icon, PopButton, fmtG, fmtInt } from "./ui";

export function ConfirmSheet() {
  const { sheet, setSheet } = useApp();
  const open = sheet.kind !== "closed";
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setSheet({ kind: "closed" });
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep keyboard focus inside the sheet.
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prevFocus?.focus?.();
    };
  }, [open, setSheet]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <div className="backdrop absolute inset-0 bg-black/70" onClick={() => setSheet({ kind: "closed" })} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet relative flex max-h-[88dvh] w-full max-w-[430px] flex-col border-t-4 border-lime bg-surface focus:outline-none lg:max-h-[85dvh] lg:max-w-[600px] lg:border-4 lg:shadow-[8px_8px_0_#000]"
      >
        <button
          onClick={() => setSheet({ kind: "closed" })}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink"
          aria-label="Close"
        >
          <Icon.close />
        </button>
        <SheetBody sheet={sheet} titleId={titleId} />
      </div>
    </div>
  );
}

function SheetBody({ sheet, titleId }: { sheet: Exclude<Sheet, { kind: "closed" }>; titleId: string }) {
  switch (sheet.kind) {
    case "review":
      // key resets row state when a new parse result arrives
      return <Review key={sheet.rows.map((r) => r.key).join()} sheet={sheet} titleId={titleId} />;
    case "clarify":
      return <Clarify sheet={sheet} titleId={titleId} />;
    case "error":
      return <ErrorState sheet={sheet} titleId={titleId} />;
    case "nonfood":
      return <NonFood text={sheet.text} titleId={titleId} />;
    case "passcode":
      return <Passcode sheet={sheet} titleId={titleId} />;
    case "edit":
      return <Edit key={sheet.item.id} item={sheet.item} titleId={titleId} />;
    case "add":
      return <AddMenu text={sheet.text} titleId={titleId} />;
    case "barcode":
      return <BarcodeSheet titleId={titleId} />;
    case "saveMeal":
      return <SaveMeal sheet={sheet} titleId={titleId} />;
  }
}

function Header({ label, title, titleId, children }: { label: string; title: ReactNode; titleId: string; children?: ReactNode }) {
  return (
    <div className="px-5 pb-3 pr-14 pt-5">
      <p className="label">{label}</p>
      <h2 id={titleId} className="mt-1 text-xl font-bold leading-tight">
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ------------------------------ review ------------------------------- */

/** Strip draft-only fields, keep what a saved meal needs. */
const toParsed = (rows: DraftItem[]): ParsedItem[] =>
  rows.filter((r) => r.name.trim()).map((r) => ParsedItemSchema.parse({ ...r, name: r.name.trim(), unit: r.unit.trim() || "serving" }));

function Review({ sheet, titleId }: { sheet: Extract<Sheet, { kind: "review" }>; titleId: string }) {
  const { commitRows, setSheet } = useApp();
  const [rows, setRows] = useState<DraftItem[]>(sheet.rows);
  const [saving, setSaving] = useState(false);
  const valid = rows.filter((r) => r.name.trim());
  const totals = sumItems(valid);
  const manual = rows.every((r) => r.source === "manual");

  const update = (key: string, patch: Partial<DraftItem>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <>
      <Header label={manual ? "Manual entry" : "Confirm"} title={manual ? "Add food" : `${rows.length} item${rows.length === 1 ? "" : "s"} found`} titleId={titleId}>
        {sheet.photo && <PhotoThumb src={sheet.photo} />}
        {sheet.text && !manual && <p className="mt-1 truncate text-sm text-ink-2">“{sheet.text}”</p>}
        {!manual && <EngineTag engine={sheet.engine} photo={!!sheet.photo} />}
        {sheet.notice && (
          <p className="mt-3 flex gap-2 border border-warn/60 bg-warn/10 p-2.5 text-xs" role="status">
            <span className="text-warn">
              <Icon.alert size={14} />
            </span>
            {sheet.notice}
          </p>
        )}
      </Header>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
        {rows.map((r) => (
          <DraftRow key={r.key} row={r} onChange={(p) => update(r.key, p)} onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
        ))}
        <button
          onClick={() => setRows((rs) => [...rs, blankRow("", rs.at(-1)?.meal)])}
          className="flex h-11 w-full items-center justify-center gap-2 border border-dashed border-line text-xs font-bold uppercase tracking-[0.1em] text-ink-2 hover:text-ink"
        >
          <Icon.plus size={16} /> Add another item
        </button>
      </div>
      <div className="border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-3">
            <span className="label">Total</span>
            {valid.length > 0 && valid.every((r) => r.calories > 0) && (
              <button
                className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 underline decoration-lime decoration-2 underline-offset-4 hover:text-ink"
                onClick={() => setSheet({ kind: "saveMeal", items: toParsed(valid), name: sheet.text.length <= 30 ? sheet.text : "", then: { ...sheet, rows } })}
              >
                Save as meal
              </button>
            )}
          </span>
          <span className="num text-sm text-ink-2">
            <strong className="text-lg text-ink">{fmtInt(totals.calories)}</strong> kcal · P {fmtG(totals.protein_g)} · C {fmtG(totals.carbs_g)} · F {fmtG(totals.fat_g)}
          </span>
        </div>
        <PopButton
          block
          disabled={!valid.length || saving}
          onClick={async () => {
            setSaving(true);
            await commitRows(valid);
            setSaving(false);
          }}
        >
          <Icon.check size={18} /> Add to log
        </PopButton>
      </div>
    </>
  );
}

const ENGINE_TAG: Record<Engine, { text: string; cls: string } | null> = {
  local: { text: "Instant · food library", cls: "face-lime" },
  cache: { text: "From your history · no AI call", cls: "face-lime" },
  llm: { text: "AI estimate", cls: "face-violet" },
  barcode: { text: "Label values · Open Food Facts", cls: "face-lime" },
  manual: null,
};

function PhotoThumb({ src }: { src: string }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
      <img src={src} alt="Your photo" className="h-16 w-16 border border-line object-cover" />
      <p className="text-[11px] text-ink-3">Photo analysed by AI, not stored. Check the portions: photos hide oil and depth.</p>
    </div>
  );
}

function EngineTag({ engine, photo }: { engine: Engine; photo?: boolean }) {
  const t = photo ? { text: "AI · from your photo", cls: "face-violet" } : ENGINE_TAG[engine];
  if (!t) return null;
  return (
    <span className={`plunk ${t.cls} mt-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em]`} style={{ ["--d" as string]: "2px" }}>
      {engine === "llm" ? <Icon.coach size={11} /> : <Icon.bolt size={11} />} {t.text}
    </span>
  );
}

export function DraftRow({ row, onChange, onRemove }: { row: DraftItem; onChange: (p: Partial<DraftItem>) => void; onRemove: () => void }) {
  // Changing quantity scales nutrients proportionally (keeps per-unit values).
  const setQuantity = (q: number) => {
    if (row.quantity > 0 && q > 0) {
      const k = q / row.quantity;
      const r1 = (n: number) => Math.round(n * k * 10) / 10;
      onChange({
        quantity: q,
        calories: Math.round(row.calories * k),
        protein_g: r1(row.protein_g),
        carbs_g: r1(row.carbs_g),
        fat_g: r1(row.fat_g),
        fibre_g: r1(row.fibre_g),
        micros: scaleMicros(row.micros, k),
      });
    } else onChange({ quantity: q });
  };

  return (
    <div className={`plunk face-card p-3 ${row.needsInput && row.calories === 0 ? "!shadow-[inset_0_0_0_2px_var(--warn)]" : ""}`} style={{ ["--d" as string]: "3px" }}>
      {row.needsInput && row.calories === 0 && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warn">
          <Icon.alert size={13} /> Didn&apos;t recognise this. Add the numbers (they&apos;ll be remembered).
        </p>
      )}
      <div className="flex gap-2">
        <label className="field compact flex-1">
          <span>Item</span>
          <input value={row.name} maxLength={80} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Poha" />
        </label>
        <button onClick={onRemove} className="flex w-11 items-center justify-center border border-line text-ink-3 hover:text-over" aria-label={`Remove ${row.name || "item"}`}>
          <Icon.trash size={18} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1.2fr_1.4fr] gap-2">
        <NumField label="Qty" value={row.quantity} onCommit={setQuantity} max={5000} />
        <label className="field compact">
          <span>Unit</span>
          <input value={row.unit} maxLength={30} onChange={(e) => onChange({ unit: e.target.value })} />
        </label>
        <label className="field compact">
          <span>Meal</span>
          <select value={row.meal} onChange={(e) => onChange({ meal: e.target.value as Meal })}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        <NumField label="Kcal" value={row.calories} onCommit={(v) => onChange({ calories: Math.round(v) })} max={5000} />
        <NumField label="Prot" value={row.protein_g} onCommit={(v) => onChange({ protein_g: v })} accent="var(--color-protein)" />
        <NumField label="Carb" value={row.carbs_g} onCommit={(v) => onChange({ carbs_g: v })} accent="var(--color-carbs)" />
        <NumField label="Fat" value={row.fat_g} onCommit={(v) => onChange({ fat_g: v })} accent="var(--color-fat)" />
        <NumField label="Fibre" value={row.fibre_g} onCommit={(v) => onChange({ fibre_g: v })} accent="var(--color-fibre)" />
      </div>
      {row.source === "llm" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ConfidenceDot level={row.confidence} />
          {row.assumed && <span className="tag text-warn">Assumed</span>}
          {row.notes && <span className={`text-xs ${row.notes === "Your saved values" ? "font-semibold text-ok" : "text-ink-2"}`}>{row.notes}</span>}
        </div>
      )}
    </div>
  );
}

/** Number input that lets you clear and retype; commits a clean number on change/blur. */
function NumField({ label, value, onCommit, accent, max = 1000 }: { label: string; value: number; onCommit: (v: number) => void; accent?: string; max?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field compact">
      <span style={accent ? { color: accent } : undefined}>{label}</span>
      <input
        inputMode="decimal"
        value={draft ?? String(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const s = e.target.value.replace(/[^\d.]/g, "");
          setDraft(s);
          const n = Number(s);
          if (s !== "" && !s.endsWith(".") && Number.isFinite(n)) onCommit(Math.min(n, max));
        }}
        onBlur={() => {
          const n = Number(draft);
          if (draft !== null) onCommit(Number.isFinite(n) ? Math.min(n, max) : 0);
          setDraft(null);
        }}
        className="num !px-1.5 text-center"
      />
    </label>
  );
}

/* ------------------------------ edit --------------------------------- */

const toDraft = (i: LogItem): DraftItem => ({ ...i, key: i.id, origin: { quantity: i.quantity, n: nutrientsOf(i) } });

function Edit({ item, titleId }: { item: LogItem; titleId: string }) {
  const { updateItem, correctItem } = useApp();
  const [rows, setRows] = useState<DraftItem[]>(() => [toDraft(item)]);
  const [fix, setFix] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const origin = rows[0]?.origin ?? { quantity: item.quantity, n: nutrientsOf(item) };
  const totals = sumItems(rows.filter((r) => r.name.trim()));
  const loggedAt = new Date(item.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  const update = (key: string, patch: Partial<DraftItem>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const applyFix = async () => {
    if (!fix.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const base = rows[0];
    const res = await correctItem(
      { name: base.name, quantity: base.quantity, unit: base.unit, meal: base.meal, calories: base.calories, protein_g: base.protein_g, carbs_g: base.carbs_g, fat_g: base.fat_g, fibre_g: base.fibre_g, confidence: base.confidence, assumed: base.assumed, notes: base.notes },
      fix.trim(),
    );
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.message });
    // Keep the original values as origin, so the correction calibrates this food.
    setRows(res.items.map((i, k) => ({ ...i, key: k === 0 ? item.id : `${item.id}-${k}`, source: "llm", origin })));
    setFix("");
    setMsg({ ok: true, text: res.notice ?? "Corrected. Check it and save." });
  };

  return (
    <>
      <Header label={`Edit · logged ${loggedAt}`} title={item.name} titleId={titleId} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
        {rows.map((r) => (
          <DraftRow key={r.key} row={r} onChange={(p) => update(r.key, p)} onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
        ))}
        <form
          className="card space-y-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void applyFix();
          }}
        >
          <label className="field compact">
            <span>Correct this</span>
            <input value={fix} maxLength={300} onChange={(e) => setFix(e.target.value)} placeholder="e.g. that was 1 tbsp of oil, not 3" />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-3">Say what was different. Your fix is remembered for next time.</p>
            <button type="submit" className="pop-btn sm lime shrink-0" disabled={!fix.trim() || busy}>
              {busy ? "Fixing…" : "Fix it"}
            </button>
          </div>
          {msg && (
            <p role="status" className={`flex items-start gap-1.5 text-xs ${msg.ok ? "text-ok" : "text-warn"}`}>
              {msg.ok ? <Icon.check size={13} /> : <Icon.alert size={13} />} {msg.text}
            </p>
          )}
        </form>
      </div>
      <div className="border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <p className="num mb-3 text-right text-sm text-ink-2">
          <strong className="text-lg text-ink">{fmtInt(totals.calories)}</strong> kcal · P {fmtG(totals.protein_g)} · C {fmtG(totals.carbs_g)} · F {fmtG(totals.fat_g)}
        </p>
        <div className="flex gap-3">
          <PopButton variant="danger" onClick={() => updateItem(item.id, [])} aria-label={`Delete ${item.name}`}>
            <Icon.trash size={18} />
          </PopButton>
          <PopButton block onClick={() => updateItem(item.id, rows)} disabled={!rows.some((r) => r.name.trim())}>
            <Icon.check size={18} /> Save changes
          </PopButton>
        </div>
      </div>
    </>
  );
}

/* ---------------------------- clarify -------------------------------- */

function Clarify({ sheet, titleId }: { sheet: Extract<Sheet, { kind: "clarify" }>; titleId: string }) {
  const { answerClarification, skipClarification } = useApp();
  const [free, setFree] = useState("");
  return (
    <>
      <Header label="Quick question" title={sheet.question} titleId={titleId}>
        {sheet.photo ? <PhotoThumb src={sheet.photo} /> : <p className="mt-1 truncate text-sm text-ink-2">“{sheet.text}”</p>}
      </Header>
      <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap gap-2">
          {sheet.answers.map((a) => (
            <button key={a} className="chip" onClick={() => answerClarification(a)}>
              {a}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (free.trim()) answerClarification(free.trim());
          }}
        >
          <label className="field compact flex-1">
            <span>Or type it</span>
            <input value={free} maxLength={100} onChange={(e) => setFree(e.target.value)} placeholder="e.g. half a plate" />
          </label>
          <button type="submit" className="pop-btn w-12 !px-0" disabled={!free.trim()} aria-label="Send answer">
            <Icon.send />
          </button>
        </form>
        <PopButton variant="ghost" block className="mt-4" onClick={skipClarification}>
          Skip · use a typical portion
        </PopButton>
      </div>
    </>
  );
}

/* ------------------------ error / nonfood / passcode ------------------------ */

function ErrorState({ sheet, titleId }: { sheet: Extract<Sheet, { kind: "error" }>; titleId: string }) {
  const { openManual, retry } = useApp();
  const canRetry = sheet.retry && sheet.code !== "offline" && sheet.code !== "config";
  return (
    <>
      <Header
        label={sheet.code === "offline" ? "Offline" : "Hmm"}
        title={
          <span className="flex items-start gap-2">
            <span className="mt-0.5 text-warn">
              <Icon.alert />
            </span>
            {sheet.message}
          </span>
        }
        titleId={titleId}
      >
        {sheet.text && <p className="mt-1 truncate text-sm text-ink-2">“{sheet.text}”</p>}
      </Header>
      <div className="flex gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <PopButton block onClick={() => openManual(sheet.text)}>
          Add manually
        </PopButton>
        {canRetry && (
          <PopButton variant="ghost" block onClick={() => retry(sheet.retry!)}>
            Try again
          </PopButton>
        )}
      </div>
    </>
  );
}

function NonFood({ text, titleId }: { text: string; titleId: string }) {
  const { openManual, setSheet } = useApp();
  return (
    <>
      <Header label="Not food?" title="That doesn't look like something you ate." titleId={titleId}>
        <p className="mt-1 truncate text-sm text-ink-2">“{text}”</p>
      </Header>
      <div className="flex gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <PopButton block onClick={() => openManual(text)}>
          Add manually
        </PopButton>
        <PopButton variant="ghost" block onClick={() => setSheet({ kind: "closed" })}>
          Never mind
        </PopButton>
      </div>
    </>
  );
}

function Passcode({ sheet, titleId }: { sheet: Extract<Sheet, { kind: "passcode" }>; titleId: string }) {
  const { submitPasscode } = useApp();
  const [code, setCode] = useState("");
  return (
    <>
      <Header label="Locked" title="Enter the app passcode" titleId={titleId}>
        <p className="mt-1 text-sm text-ink-2">Stored on this device only. Change it later in Settings.</p>
      </Header>
      <form
        className="flex gap-2 px-5 pb-[max(20px,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          if (code) void submitPasscode(code, sheet.retry);
        }}
      >
        <label className="field flex-1">
          <span>Passcode</span>
          <input type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <button type="submit" className="pop-btn" disabled={!code}>
          Unlock
        </button>
      </form>
    </>
  );
}

/* ------------------------------ add menu ------------------------------ */

function AddMenu({ text, titleId }: { text: string; titleId: string }) {
  const { openManual, setSheet, meals, recipes, logSavedMeal, quickAdd, myFoods, online } = useApp();
  const saved = Object.values(meals).sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt);
  const recipeList = Object.values(recipes).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <Header label="Add food" title="How do you want to add it?" titleId={titleId} />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-3">
          <button className="plunk face-card flex flex-col items-start gap-2 p-4 text-left" style={{ ["--d" as string]: "3px" }} onClick={() => openManual(text)}>
            <Icon.edit size={20} />
            <span className="font-bold">Type the numbers</span>
            <span className="text-xs text-ink-2">Manual entry</span>
          </button>
          <button
            className="plunk face-card flex flex-col items-start gap-2 p-4 text-left disabled:opacity-50"
            style={{ ["--d" as string]: "3px" }}
            onClick={() => setSheet({ kind: "barcode" })}
            disabled={!online}
          >
            <Icon.barcode size={20} />
            <span className="font-bold">Scan a barcode</span>
            <span className="text-xs text-ink-2">{online ? "Packaged food, label values" : "Needs a connection"}</span>
          </button>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <p className="label">Saved meals</p>
            <Link href="/foods" className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-ink" onClick={() => setSheet({ kind: "closed" })}>
              Manage
            </Link>
          </div>
          {saved.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">None yet. After logging, tap “Save as meal” on the confirm screen, or on a meal in Today.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
              {saved.map((m) => (
                <li key={m.id}>
                  <button className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-elevated" onClick={() => logSavedMeal(m.id)}>
                    <Icon.bookmark size={16} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="block truncate text-xs text-ink-2">{m.items.map((i) => i.name).join(", ")}</span>
                    </span>
                    <span className="num text-sm font-bold">{fmtInt(sumItems(m.items).calories)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {recipeList.length > 0 && (
          <div>
            <p className="label">Your recipes · 1 serving</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recipeList.map((r) => {
                const key = foodKey(r.name);
                return (
                  <button key={r.id} className="chip" disabled={!myFoods[key]} onClick={() => quickAdd(key)}>
                    {r.name} <span className="num font-normal text-ink-3">{perServing(r).n[0]} kcal</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------ barcode ------------------------------ */

function BarcodeSheet({ titleId }: { titleId: string }) {
  const { lookupBarcode, openManual, submitPhoto } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: ApiErrorCode; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const labelRef = useRef<HTMLInputElement>(null);

  const onCode = useCallback(
    async (code: string) => {
      setBusy(true);
      setErr(null);
      const r = await lookupBarcode(code);
      setBusy(false);
      if (!r.ok) setErr({ code: r.code, message: r.message });
    },
    [lookupBarcode],
  );

  return (
    <>
      <Header label="Barcode" title="Scan a packaged food" titleId={titleId}>
        <p className="mt-1 text-xs text-ink-3">Looks it up in Open Food Facts, a free product database. Only the barcode number is sent.</p>
      </Header>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {err ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 border border-warn/60 bg-warn/10 p-3 text-sm" role="alert">
              <span className="text-warn">
                <Icon.alert size={16} />
              </span>
              {err.message}
            </p>
            <div className="flex flex-wrap gap-3">
              <PopButton variant="lime" onClick={() => labelRef.current?.click()}>
                <Icon.camera size={16} /> Snap the label
              </PopButton>
              <PopButton variant="ghost" onClick={() => (setErr(null), setAttempt((a) => a + 1))}>
                Scan again
              </PopButton>
              <PopButton variant="ghost" onClick={() => openManual("")}>
                Type it
              </PopButton>
            </div>
            <input
              ref={labelRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) submitPhoto(f, "This is a nutrition label. Use the label's per-serving values for 1 serving.");
              }}
            />
          </div>
        ) : (
          <BarcodeScanner key={attempt} onCode={onCode} busy={busy} />
        )}
      </div>
    </>
  );
}

/* ------------------------------ save meal ------------------------------ */

function SaveMeal({ sheet, titleId }: { sheet: Extract<Sheet, { kind: "saveMeal" }>; titleId: string }) {
  const { saveMeal, setSheet } = useApp();
  const meal = sheet.items[0]?.meal ?? mealForTime();
  const [name, setName] = useState(sheet.name || `My ${MEAL_STYLE[meal].label.toLowerCase()}`);
  const t = sumItems(sheet.items);
  return (
    <>
      <Header label="Save as meal" title="Log all of this in one tap next time" titleId={titleId} />
      <form
        className="space-y-4 px-5 pb-[max(20px,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void saveMeal(name, sheet.items, sheet.then);
        }}
      >
        <label className="field">
          <span>Meal name</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <ul className="space-y-1 text-sm">
          {sheet.items.map((i, k) => (
            <li key={k} className="num flex justify-between gap-2">
              <span className="truncate text-ink-2">
                {fmtG(i.quantity)} {i.unit} {i.name}
              </span>
              <span className="shrink-0">{fmtInt(i.calories)}</span>
            </li>
          ))}
        </ul>
        <p className="num text-right text-sm text-ink-2">
          <strong className="text-ink">{fmtInt(t.calories)}</strong> kcal · P {fmtG(t.protein_g)} · C {fmtG(t.carbs_g)} · F {fmtG(t.fat_g)}
        </p>
        <div className="flex gap-3">
          {sheet.then && (
            <PopButton variant="ghost" onClick={() => setSheet(sheet.then!)}>
              Back
            </PopButton>
          )}
          <PopButton type="submit" className="flex-1" disabled={!name.trim()}>
            <Icon.bookmark size={16} /> Save meal
          </PopButton>
        </div>
      </form>
    </>
  );
}
