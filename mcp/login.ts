/**
 * Sign the MCP server in to your Bite account (or out of it):
 *   npm run mcp:login            asks for your email and password
 *   npm run mcp:login -- logout  forgets the saved session
 * The password goes straight to Supabase and is never written anywhere; only
 * the session it returns is saved (see auth.ts).
 */
import { createInterface } from "node:readline/promises";
import { SESSION_FILE, SetupError, createSupabase } from "./auth";

/** Read a line without echoing it. */
function askHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((done, fail) => {
    let value = "";
    const finish = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (err) fail(err);
      else done(value);
    };
    const onData = (chunk: Buffer) => {
      // Drop escape sequences (paste markers, arrow keys) so they can't end up in the password.
      for (const ch of chunk.toString("utf8").replace(/\u001b\[[0-9;]*[A-Za-z~]/g, "")) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new SetupError("Cancelled."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const sb = createSupabase();
  if (process.argv[2] === "logout") {
    await sb.auth.signOut({ scope: "local" });
    console.log("Signed out. The saved session is gone.");
    return;
  }
  if (!process.stdin.isTTY) throw new SetupError("Run this in a terminal so you can type your email and password.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Bite email: ")).trim();
  rl.close();
  const password = await askHidden("Password (hidden): ");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new SetupError(`Couldn't sign in: ${error?.message ?? "no session returned"}`);
  console.log(`Signed in as ${data.session.user.email}. Session saved to ${SESSION_FILE}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof SetupError ? e.message : e);
    process.exit(1);
  },
);
