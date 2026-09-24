"use client";
import { useState } from "react";
import { blankRow, useApp, type DraftItem } from "@/components/AppProvider";
import { DraftRow } from "@/components/ConfirmSheet";
import { Icon, PopButton, fmtG, fmtInt } from "@/components/ui";
import { foodKey, nutrientsOf } from "@/lib/calibration";
import { perServing, type Recipe } from "@/lib/library";
import { ParsedItemSchema } from "@/lib/schemas";
import { sumItems } from "@/lib/totals";

export default function FoodsPage() {
  const { ready } = useApp();
  if (!ready) return <p className="label pulse pt-10">Loading…</p>;
  return (
    <div className="space-y-6 pb-4">
      <header>
        <p className="label">Foods</p>
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Your meals, recipes &amp; foods</h1>
        <p className="mt-1 text-sm text-ink-2">Everything here logs instantly, offline, with no AI call.</p>
      </header>
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6">
          <SavedMeals />
          <Recipes />
        </div>
        <MyFoods />
      </div>
    </div>
  );
}

/* ------------------------------ saved meals ------------------------------ */

function SavedMeals() {
  const { meals, logSavedMeal, deleteMeal, estimateItems, setSheet, online } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const list = Object.values(meals).sort((a, b) => b.uses - a.uses || b.createdAt - a.createdAt);

  return (
    <section className="plunk face-card space-y-3 p-4" style={{ ["--d" as string]: "4px" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label flex items-center gap-1.5">
            <Icon.bookmark size={13} /> Saved meals
          </p>
          <p className="mt-1 text-xs text-ink-2">Groups of foods you eat together. Log them from + in one tap.</p>
        </div>
        {!adding && (
          <PopButton variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Icon.plus size={14} /> New
          </PopButton>
        )}
      </div>
      {adding && (
        <form
          className="space-y-2 border border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            setMsg(null);
            const r = await estimateItems(text.trim());
            setBusy(false);
            if (!r.ok) return setMsg(r.message);
            if (!r.items.length) return setMsg("Couldn't find any food in that.");
            if (r.unknown.length) setMsg(`Skipped what it didn't recognise: ${r.unknown.join(", ")}`);
            setSheet({ kind: "saveMeal", items: r.items, name: name.trim() });
            setAdding(false);
            setName("");
            setText("");
          }}
        >
          <label className="field compact">
            <span>Name</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Usual breakfast" />
          </label>
          <label className="field compact">
            <span>What&apos;s in it</span>
            <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="2 roti, 1 katori dal, 1 glass chaas" />
          </label>
          <div className="flex gap-3">
            <PopButton type="submit" variant="lime" size="sm" disabled={busy || !text.trim()}>
              {busy ? "Working it out…" : "Next"}
            </PopButton>
            <PopButton variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </PopButton>
          </div>
          {!online && <p className="text-[11px] text-ink-3">Offline: only foods in the library can be recognised.</p>}
        </form>
      )}
      {msg && (
        <p className="text-xs text-warn" role="status">
          {msg}
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing saved yet. Tap the bookmark on a meal in Today, or “Save as meal” when you confirm food.</p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {list.map((m) => {
            const t = sumItems(m.items);
            return (
              <li key={m.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-xs text-ink-2">{m.items.map((i) => `${fmtG(i.quantity)} ${i.unit} ${i.name}`).join(", ")}</p>
                  <p className="num text-[11px] text-ink-3">
                    {fmtInt(t.calories)} kcal · P {fmtG(t.protein_g)} · C {fmtG(t.carbs_g)} · F {fmtG(t.fat_g)}
                    {m.uses ? ` · logged ${m.uses}×` : ""}
                  </p>
                </div>
                <button className="pop-btn sm lime shrink-0" onClick={() => logSavedMeal(m.id)}>
                  Log
                </button>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-ink-3 hover:text-over"
                  aria-label={`Delete ${m.name}`}
                  onClick={() => confirm(`Delete "${m.name}"?`) && void deleteMeal(m.id)}
                >
                  <Icon.trash size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ recipes ------------------------------ */

function Recipes() {
  const { recipes, deleteRecipe, quickAdd } = useApp();
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const list = Object.values(recipes).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section className="plunk face-card space-y-3 p-4" style={{ ["--d" as string]: "4px" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label flex items-center gap-1.5">
            <Icon.book size={13} /> Recipes
          </p>
          <p className="mt-1 text-xs text-ink-2">Cook once, log by the serving. Type “1 serving {list[0]?.name ?? "rajma"}” and it uses your recipe.</p>
        </div>
        {!editing && (
          <PopButton variant="ghost" size="sm" onClick={() => setEditing("new")}>
            <Icon.plus size={14} /> New
          </PopButton>
        )}
      </div>
      {editing && <RecipeEditor key={editing === "new" ? "new" : editing.id} recipe={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      {list.length === 0 && !editing ? (
        <p className="text-sm text-ink-3">No recipes yet. Add your dal, sabzi or overnight oats once and log them in a tap.</p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {list.map((r) => {
            const { n } = perServing(r);
            return (
              <li key={r.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="num text-[11px] text-ink-3">
                    per serving ({r.servings} total): {fmtInt(n[0])} kcal · P {n[1]} · C {n[2]} · F {n[3]} · {r.ingredients.length} ingredients
                  </p>
                </div>
                <button className="pop-btn sm lime shrink-0" onClick={() => quickAdd(foodKey(r.name))}>
                  Log
                </button>
                <button className="flex h-9 w-9 shrink-0 items-center justify-center text-ink-3 hover:text-ink" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                  <Icon.edit size={16} />
                </button>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-ink-3 hover:text-over"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => confirm(`Delete the "${r.name}" recipe?`) && void deleteRecipe(r.id)}
                >
                  <Icon.trash size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const toRow = (i: Recipe["ingredients"][number]): DraftItem => ({ ...i, key: crypto.randomUUID(), source: "llm", origin: { quantity: i.quantity, n: nutrientsOf(i) } });

function RecipeEditor({ recipe, onDone }: { recipe: Recipe | null; onDone: () => void }) {
  const { estimateItems, saveRecipe, showToast } = useApp();
  const [name, setName] = useState(recipe?.name ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 4));
  const [text, setText] = useState(recipe?.text ?? "");
  const [rows, setRows] = useState<DraftItem[]>(() => (recipe?.ingredients ?? []).map(toRow));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = Number(servings);
  const validRows = rows.filter((r) => r.name.trim());
  const per = validRows.length && s > 0 ? perServing({ servings: s, ingredients: validRows }) : null;

  const calculate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await estimateItems(text.trim(), { preferAI: true });
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    setRows([...r.items.map(toRow), ...r.unknown.map((u) => blankRow(u.slice(0, 80), "lunch", true))]);
    if (r.unknown.length) setMsg(`Fill in what it didn't recognise: ${r.unknown.join(", ")}`);
  };

  return (
    <div className="space-y-3 border border-line p-3">
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <label className="field compact">
          <span>Recipe name</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom's rajma" />
        </label>
        <label className="field compact">
          <span>Servings</span>
          <input inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
      </div>
      <label className="field compact">
        <span>All ingredients (raw weights if you know them)</span>
        <textarea
          rows={3}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="250g rajma (dry), 2 tbsp oil, 2 onion, 2 tomato, 1 tsp ghee"
          className="!min-h-[88px] resize-y"
        />
      </label>
      <PopButton variant="ghost" size="sm" onClick={() => void calculate()} disabled={busy || !text.trim()}>
        {busy ? "Working it out…" : rows.length ? "Recalculate from text" : "Work out the nutrition"}
      </PopButton>
      {msg && (
        <p className="text-xs text-warn" role="status">
          {msg}
        </p>
      )}
      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="label">Ingredients · edit anything that looks off</p>
          {rows.map((r) => (
            <DraftRow key={r.key} row={r} onChange={(p) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...p } : x)))} onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
          ))}
          <button
            onClick={() => setRows((rs) => [...rs, blankRow("", "lunch")])}
            className="flex h-10 w-full items-center justify-center gap-2 border border-dashed border-line text-xs font-bold uppercase tracking-[0.1em] text-ink-2 hover:text-ink"
          >
            <Icon.plus size={14} /> Add ingredient
          </button>
        </div>
      )}
      {per && (
        <p className="num border-t border-line pt-2 text-sm">
          Per serving: <strong className="text-lg">{fmtInt(per.n[0])}</strong> kcal · P {per.n[1]} g · C {per.n[2]} g · F {per.n[3]} g · fibre {per.n[4]} g
        </p>
      )}
      <div className="flex gap-3">
        <PopButton
          variant="lime"
          size="sm"
          disabled={!name.trim() || !(s > 0) || !validRows.length || validRows.some((r) => r.needsInput && r.calories === 0)}
          onClick={async () => {
            const now = Date.now();
            await saveRecipe({
              id: recipe?.id ?? crypto.randomUUID(),
              name: name.trim().slice(0, 60),
              servings: Math.min(100, s),
              ingredients: validRows.map((r) => ParsedItemSchema.parse({ ...r, name: r.name.trim(), unit: r.unit.trim() || "serving" })),
              text: text.trim(),
              createdAt: recipe?.createdAt ?? now,
              updatedAt: now,
            });
            showToast(`Saved ${name.trim()}. Log it as "1 serving ${name.trim().toLowerCase()}".`);
            onDone();
          }}
        >
          Save recipe
        </PopButton>
        <PopButton variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </PopButton>
      </div>
    </div>
  );
}

/* ------------------------------ my foods ------------------------------ */

function MyFoods() {
  const { myFoods, forgetFood } = useApp();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const all = Object.values(myFoods).sort((a, b) => Number(b.verified) - Number(a.verified) || b.uses - a.uses);
  const list = q.trim() ? all.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  const shown = showAll || q ? list : list.slice(0, 12);
  return (
    <section className="card space-y-3 p-4">
      <div>
        <p className="label">My foods</p>
        <p className="mt-1 text-xs text-ink-2">
          Everything you log is remembered, so it parses instantly next time. Edit the numbers when you log a food and it becomes{" "}
          <span className="font-semibold text-ok">calibrated</span>: your values win over the library and AI from then on.
        </p>
      </div>
      {all.length > 8 && (
        <label className="field compact">
          <span>Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="paneer, whey…" />
        </label>
      )}
      {all.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing yet. Log a few meals.</p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {shown.map((f) => (
            <li key={f.key} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold">
                  {f.name}
                  {f.verified && <span className="tag text-ok">Calibrated</span>}
                </p>
                <p className="num text-xs text-ink-2">
                  per {f.unit}: {Math.round(f.per[0])} kcal · P {f.per[1]} · C {f.per[2]} · F {f.per[3]}
                  {f.pm ? ` · Na ${Math.round(f.pm[0])} mg` : ""} · logged {f.uses}×
                </p>
              </div>
              <button onClick={() => forgetFood(f.key)} className="flex h-9 w-9 items-center justify-center text-ink-3 hover:text-over" aria-label={`Forget ${f.name}`}>
                <Icon.trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!q && list.length > 12 && (
        <button className="text-xs font-bold uppercase tracking-[0.1em] text-ink-2" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}
