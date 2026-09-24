// Applies supabase/schema.sql and registers the owner email on the invite list.
// Usage: npm run db:setup -- you@example.com
// Reads POSTGRES_URL_NON_POOLING / POSTGRES_URL from .env.local (see `vercel env pull`). Never prints it.
import { readFileSync } from "node:fs";
import pg from "pg";

const owner = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner)) {
  console.error("Usage: npm run db:setup -- you@example.com");
  process.exit(1);
}
const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("No POSTGRES_URL in the environment. Connect Supabase to the Vercel project, then run: npx vercel env pull .env.local");
  process.exit(1);
}

// Supabase's pooler presents a certificate Node doesn't chain by default; the
// connection is still TLS-encrypted.
const client = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  await client.query(
    `insert into public.allowed_emails (email, role, invited_by) values ($1, 'owner', 'setup')
     on conflict (email) do update set role = 'owner'`,
    [owner],
  );
  const { rows } = await client.query("select count(*)::int as n from public.allowed_emails");
  console.log(`Schema applied. Owner: ${owner}. Invite list has ${rows[0].n} email(s).`);
} finally {
  await client.end();
}
