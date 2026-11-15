"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon, PopButton } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type Details = { clientName: string; clientSite: string | null; redirectHost: string; email: string };
type State = { kind: "loading" } | { kind: "ask"; details: Details } | { kind: "leaving" } | { kind: "error"; message: string };

/** Only http(s) links are shown or followed; anything else from the request is treated as text. */
const hostOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.host : null;
  } catch {
    return null;
  }
};

/**
 * "Allow this assistant to use Bite?" Supabase's OAuth server sends people
 * here (already signed in: the app shell shows the sign-in screen first) with
 * an authorization_id; approving or denying sends them back to the assistant.
 */
function Consent() {
  const id = useSearchParams().get("authorization_id");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const sb = supabase();
    const fail = (message: string) => live && setState({ kind: "error", message });
    if (!sb) return void fail("Accounts aren't enabled on this copy of Bite, so there's nothing to connect to.");
    if (!id) return void fail("This link is missing its request. Start again from the assistant you're connecting.");
    sb.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (!live) return;
      if (error || !data) return fail("This request has expired or was already answered. Start again from the assistant you're connecting.");
      // Already approved earlier: Supabase hands back where to go.
      if (!("authorization_id" in data)) {
        setState({ kind: "leaving" });
        window.location.assign(data.redirect_url);
        return;
      }
      const redirectHost = hostOf(data.redirect_uri);
      if (!redirectHost) return fail("This request would send you somewhere that isn't a web address, so it was stopped.");
      setState({ kind: "ask", details: { clientName: data.client.name || "An app", clientSite: hostOf(data.client.uri), redirectHost, email: data.user.email } });
    });
    return () => {
      live = false;
    };
  }, [id]);

  const answer = async (allow: boolean) => {
    const sb = supabase();
    if (!sb || !id || busy) return;
    setBusy(true);
    const { data, error } = allow ? await sb.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }) : await sb.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) {
      setBusy(false);
      return setState({ kind: "error", message: "That didn't go through. Start again from the assistant you're connecting." });
    }
    setState({ kind: "leaving" });
    window.location.assign(data.redirect_url);
  };

  if (state.kind === "loading") return <p className="label pulse pt-10">Checking the request…</p>;
  if (state.kind === "leaving") return <p className="label pulse pt-10">Sending you back…</p>;
  if (state.kind === "error") {
    return (
      <section className="card mx-auto max-w-md space-y-2 p-5" role="alert">
        <p className="label flex items-center gap-1.5 text-warn">
          <Icon.alert size={13} /> Couldn&apos;t connect
        </p>
        <p className="text-sm">{state.message}</p>
      </section>
    );
  }

  const d = state.details;
  return (
    <section className="plunk face-card mx-auto max-w-md space-y-4 p-5" style={{ ["--d" as string]: "5px" }} aria-labelledby="consent-title">
      <div>
        <p className="label">Connect an assistant</p>
        <h1 id="consent-title" className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">
          Let {d.clientName} use your Bite log?
        </h1>
        <p className="mt-1 text-xs text-ink-2">
          {d.clientSite ? `${d.clientSite} · ` : ""}you&apos;ll be sent back to <strong className="text-ink">{d.redirectHost}</strong>
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <p className="label">It will be able to</p>
        <ul className="space-y-1.5">
          {["See what you've eaten, your targets, progress, water and weight", "Add and delete food, and log water and weigh-ins", "Read the rest of your Bite account data, such as saved meals and coach notes"].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-0.5 text-ok">
                <Icon.check size={14} />
              </span>
              {line}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-3">
          It acts as you ({d.email}) and can&apos;t see anyone else&apos;s data. Only allow assistants you trust and started connecting yourself. You can remove access any time in Settings, under Connected assistants.
        </p>
      </div>
      <div className="flex gap-3">
        <PopButton variant="ghost" onClick={() => void answer(false)} disabled={busy}>
          Don&apos;t allow
        </PopButton>
        <PopButton variant="lime" block onClick={() => void answer(true)} disabled={busy}>
          <Icon.check size={18} /> {busy ? "Working…" : "Allow"}
        </PopButton>
      </div>
    </section>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={<p className="label pulse pt-10">Checking the request…</p>}>
      <Consent />
    </Suspense>
  );
}
