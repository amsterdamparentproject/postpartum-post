/**
 * One-off script — removes the junk records a bot created through the public
 * signup, partner-interest and perk-idea forms starting 2026-10-19
 * (see __claude__/signup-spam-2026-10-21.md).
 *
 * Two steps, so nothing is deleted without you reading it first:
 *
 *   yarn tsx scripts/cleanup-spam-2026-10.mts prod review
 *   yarn tsx scripts/cleanup-spam-2026-10.mts prod execute
 *
 * `review` changes nothing. It finds the candidate records, checks the matching
 * Stripe customers, prints every record, saves a full backup of the rows, and
 * writes __claude__/spam-cleanup-review.json — the exact list `execute` will
 * act on. Read it; to KEEP a record, delete its entry from that JSON file.
 *
 * `execute` prints the list again, re-checks that each record is still junk
 * (e.g. a pending member that has since paid is skipped), asks you to type the
 * total count to confirm, then deletes in this order: giveaway entries and
 * "notify me" follow-ups, partner leads, members, then their Stripe customers.
 * Safe to re-run if it stops half-way: records already gone are skipped.
 *
 * What counts as a candidate:
 *   - partner_leads with status 'new' or 'idea' created on/after 2026-10-19
 *   - perk_giveaway_entries / perk_idea_followups linked to those leads
 *   - members with status 'pending' created on/after 2026-10-19
 *   - the Stripe customer of each such member — only if it was created for that
 *     member (metadata.member_id matches) and has no subscriptions at all
 */

import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const CUTOFF = "2026-10-19T00:00:00Z";
const TEST_PROJECT_REF = "byukhyutyesczrlixzos";
const REVIEW_FILE = resolve(process.cwd(), "__claude__", "spam-cleanup-review.json");

const env = process.argv[2];
const mode = process.argv[3];
if ((env !== "test" && env !== "prod") || (mode !== "review" && mode !== "execute")) {
  console.error("Usage: yarn tsx scripts/cleanup-spam-2026-10.mts <test|prod> <review|execute>");
  process.exit(1);
}

const envFile = env === "prod" ? ".env.production" : ".env.test";
config({ path: resolve(process.cwd(), envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or STRIPE_SECRET_KEY in ${envFile}`);
  process.exit(1);
}
if (env === "prod" && supabaseUrl.includes(TEST_PROJECT_REF)) {
  console.error(`Refusing to run: "prod" but ${envFile} points at the TEST Supabase project (${supabaseUrl}).`);
  process.exit(1);
}

const supabaseHost = new URL(supabaseUrl).host;
const stripeMode = /^(sk|rk)_live_/.test(stripeKey) ? "LIVE" : "test";
console.log(`Environment: ${env}   Supabase: ${supabaseHost}   Stripe: ${stripeMode} mode\n`);

const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "postpartumpost" } });
const stripe = new Stripe(stripeKey);

type Row = Record<string, unknown>;
type MemberItem = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  stripe_customer_id: string | null;
  stripe: { action: "delete" | "skip"; reason: string };
};
type LeadItem = {
  id: string;
  created_at: string;
  status: string;
  name: string;
  business_name: string;
  url: string | null;
  email: string | null;
  unusual: boolean;
};
type EntryItem = { id: string; created_at: string; name: string | null; email: string; url: string };
type Review = {
  generatedAt: string;
  supabaseHost: string;
  stripeMode: string;
  members: MemberItem[];
  leads: LeadItem[];
  giveaway_entries: EntryItem[];
  idea_followups: EntryItem[];
};

function chunk<T>(items: T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fail(what: string, message: string): never {
  console.error(`${what} failed: ${message}`);
  process.exit(1);
}

async function selectAll(table: string, filter: (q: any) => any): Promise<Row[]> {
  const { data, error } = await filter(supabase.from(table).select("*")).order("created_at", { ascending: true });
  if (error) fail(`Reading ${table}`, error.message);
  return (data ?? []) as Row[];
}

async function selectByIds(table: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunk(ids)) {
    const { data, error } = await supabase.from(table).select("*").in("id", part);
    if (error) fail(`Reading ${table}`, error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

async function selectByLeadIds(table: string, leadIds: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunk(leadIds)) {
    const { data, error } = await supabase.from(table).select("*").in("partner_lead_id", part);
    if (error) fail(`Reading ${table}`, error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

async function deleteByIds(table: string, ids: string[]): Promise<void> {
  for (const part of chunk(ids)) {
    const { error } = await supabase.from(table).delete().in("id", part);
    if (error) fail(`Deleting from ${table}`, error.message);
  }
}

/** Looks like the usual spam: long random mixed-case names, or a random 6-12 letter .com. */
function leadLooksLikeSpam(row: Row): boolean {
  const randomMixed = (s: unknown) => typeof s === "string" && /^[A-Za-z]{10,}$/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s.slice(1));
  if (row.status === "new") return randomMixed(row.first_name) && randomMixed(row.last_name) && randomMixed(row.business_name);
  let host = "";
  try {
    host = new URL(String(row.url)).hostname;
  } catch {
    return false;
  }
  return /^[a-z]{5,13}\.com$/.test(host) && !row.first_name && !row.email;
}

async function checkStripeCustomer(member: Row): Promise<MemberItem["stripe"]> {
  const customerId = member.stripe_customer_id as string | null;
  if (!customerId) return { action: "skip", reason: "no Stripe customer on this member" };
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return { action: "skip", reason: "already deleted in Stripe" };
    if (customer.metadata?.member_id !== member.id) {
      return { action: "skip", reason: "customer was not created for this member (metadata mismatch) — left alone" };
    }
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    if (subs.data.length > 0) return { action: "skip", reason: "customer has a subscription — left alone" };
    return { action: "delete", reason: "created for this member, no subscriptions" };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "resource_missing") return { action: "skip", reason: "not found in Stripe (already gone)" };
    return { action: "skip", reason: `could not check Stripe: ${err.message ?? e}` };
  }
}

function printReview(r: Review): void {
  const total = r.members.length + r.leads.length + r.giveaway_entries.length + r.idea_followups.length;
  const unusual = r.leads.filter((l) => l.unusual);

  console.log(`=== MEMBERS (${r.members.length}) — pending since ${CUTOFF.slice(0, 10)} ===`);
  for (const m of r.members) {
    console.log(`  ${m.id}  ${m.created_at.slice(0, 16)}  ${m.name.padEnd(28)} ${m.email.padEnd(38)} stripe: ${m.stripe.action} (${m.stripe.reason})`);
  }

  console.log(`\n=== PARTNER LEADS (${r.leads.length}) ===`);
  if (unusual.length) {
    console.log(`  >>> ${unusual.length} do NOT match the usual spam pattern — check these first (marked "??") <<<`);
  }
  for (const l of r.leads) {
    console.log(`  ${l.unusual ? "??" : "  "} ${l.id}  ${l.created_at.slice(0, 16)}  ${l.status.padEnd(5)} ${l.business_name.slice(0, 26).padEnd(26)} ${String(l.url ?? "").slice(0, 32).padEnd(32)} ${l.email ?? ""}`);
  }

  console.log(`\n=== GIVEAWAY ENTRIES (${r.giveaway_entries.length}) — linked to the leads above ===`);
  for (const e of r.giveaway_entries) console.log(`  ${e.id}  ${e.created_at.slice(0, 16)}  ${(e.name ?? "").padEnd(24)} ${e.email}`);

  console.log(`\n=== "NOTIFY ME" FOLLOW-UPS (${r.idea_followups.length}) — linked to the leads above ===`);
  for (const e of r.idea_followups) console.log(`  ${e.id}  ${e.created_at.slice(0, 16)}  ${(e.name ?? "").padEnd(24)} ${e.email}`);

  const stripeDeletes = r.members.filter((m) => m.stripe.action === "delete").length;
  console.log(
    `\nTOTAL: ${total} database rows (${r.members.length} members, ${r.leads.length} leads, ${r.giveaway_entries.length} giveaway entries, ${r.idea_followups.length} follow-ups) and ${stripeDeletes} Stripe customers (${stripeMode} mode).\n`,
  );
}

async function buildReview(): Promise<Review> {
  const memberRows = await selectAll("members", (q) => q.eq("status", "pending").gte("created_at", CUTOFF));
  const leadRows = await selectAll("partner_leads", (q) => q.in("status", ["new", "idea"]).gte("created_at", CUTOFF));
  const leadIds = leadRows.map((l) => l.id as string);
  const entryRows = leadIds.length ? await selectByLeadIds("perk_giveaway_entries", leadIds) : [];
  const followupRows = leadIds.length ? await selectByLeadIds("perk_idea_followups", leadIds) : [];

  const members: MemberItem[] = [];
  for (const m of memberRows) {
    members.push({
      id: m.id as string,
      created_at: String(m.created_at),
      name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      email: String(m.email),
      stripe_customer_id: (m.stripe_customer_id as string | null) ?? null,
      stripe: await checkStripeCustomer(m),
    });
  }

  const toEntry = (e: Row): EntryItem => ({
    id: e.id as string,
    created_at: String(e.created_at),
    name: (e.name as string | null) ?? null,
    email: String(e.email),
    url: String(e.url ?? ""),
  });

  return {
    generatedAt: new Date().toISOString(),
    supabaseHost,
    stripeMode,
    members,
    leads: leadRows.map((l) => ({
      id: l.id as string,
      created_at: String(l.created_at),
      status: String(l.status),
      name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
      business_name: String(l.business_name),
      url: (l.url as string | null) ?? null,
      email: (l.email as string | null) ?? null,
      unusual: !leadLooksLikeSpam(l),
    })),
    giveaway_entries: entryRows.map(toEntry),
    idea_followups: followupRows.map(toEntry),
  };
}

async function runReview(): Promise<void> {
  const review = await buildReview();
  printReview(review);

  mkdirSync(resolve(process.cwd(), "__claude__"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = resolve(process.cwd(), "__claude__", `spam-cleanup-backup-${stamp}.json`);
  const backup = {
    members: await selectByIds("members", review.members.map((m) => m.id)),
    partner_leads: await selectByIds("partner_leads", review.leads.map((l) => l.id)),
    perk_giveaway_entries: await selectByIds("perk_giveaway_entries", review.giveaway_entries.map((e) => e.id)),
    perk_idea_followups: await selectByIds("perk_idea_followups", review.idea_followups.map((e) => e.id)),
  };
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2));

  console.log(`Nothing was changed.`);
  console.log(`  Backup of every row above:  ${backupFile}`);
  console.log(`  List that "execute" will use: ${REVIEW_FILE}`);
  console.log(`To keep a record, delete its entry from the list file, then run again with "execute".`);
}

async function runExecute(): Promise<void> {
  let review: Review;
  try {
    review = JSON.parse(readFileSync(REVIEW_FILE, "utf8")) as Review;
  } catch {
    fail("Reading the review file", `${REVIEW_FILE} not found — run "review" first.`);
  }
  if (review.supabaseHost !== supabaseHost || review.stripeMode !== stripeMode) {
    fail("Safety check", `the review file was made for ${review.supabaseHost} / Stripe ${review.stripeMode}, not ${supabaseHost} / ${stripeMode}. Run "review" again.`);
  }
  const ageHours = (Date.now() - new Date(review.generatedAt).getTime()) / 3_600_000;
  if (ageHours > 24) fail("Safety check", `the review file is ${Math.round(ageHours)} hours old. Run "review" again.`);

  printReview(review);

  // Re-check against the database right now: only act on records that are still junk.
  const stillMembers = new Set(
    (await selectByIds("members", review.members.map((m) => m.id))).filter((m) => m.status === "pending").map((m) => m.id as string),
  );
  const stillLeads = new Set(
    (await selectByIds("partner_leads", review.leads.map((l) => l.id))).filter((l) => l.status === "new" || l.status === "idea").map((l) => l.id as string),
  );
  const entryIds = (await selectByIds("perk_giveaway_entries", review.giveaway_entries.map((e) => e.id))).map((e) => e.id as string);
  const followupIds = (await selectByIds("perk_idea_followups", review.idea_followups.map((e) => e.id))).map((e) => e.id as string);

  const membersToDelete = review.members.filter((m) => stillMembers.has(m.id));
  const leadsToDelete = review.leads.filter((l) => stillLeads.has(l.id));
  const skippedMembers = review.members.length - membersToDelete.length;
  const skippedLeads = review.leads.length - leadsToDelete.length;
  if (skippedMembers || skippedLeads) {
    console.log(`Skipping ${skippedMembers} member(s) and ${skippedLeads} lead(s) that are already gone or no longer pending/new/idea.\n`);
  }

  const total = membersToDelete.length + leadsToDelete.length + entryIds.length + followupIds.length;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This will permanently delete ${total} database rows and the matching Stripe customers (${stripeMode} mode).\nBackup: see the latest spam-cleanup-backup-*.json in __claude__/.\nType ${total} to confirm, anything else to cancel: `,
  );
  rl.close();
  if (answer.trim() !== String(total)) {
    console.log("Cancelled. Nothing was deleted.");
    return;
  }

  await deleteByIds("perk_giveaway_entries", entryIds);
  console.log(`Deleted ${entryIds.length} giveaway entries`);
  await deleteByIds("perk_idea_followups", followupIds);
  console.log(`Deleted ${followupIds.length} follow-ups`);
  await deleteByIds("partner_leads", leadsToDelete.map((l) => l.id));
  console.log(`Deleted ${leadsToDelete.length} partner leads`);
  await deleteByIds("members", membersToDelete.map((m) => m.id));
  console.log(`Deleted ${membersToDelete.length} members`);

  // Stripe last. Re-checked per customer; works for every member in the file, so a re-run finishes any left over.
  let deleted = 0;
  let skipped = 0;
  for (const m of review.members) {
    if (!m.stripe_customer_id || m.stripe.action !== "delete") {
      skipped++;
      continue;
    }
    const customer = await stripe.customers.retrieve(m.stripe_customer_id).catch(() => null);
    if (!customer || customer.deleted) {
      skipped++;
      continue;
    }
    const subs = await stripe.subscriptions.list({ customer: m.stripe_customer_id, status: "all", limit: 1 });
    if (customer.metadata?.member_id !== m.id || subs.data.length > 0) {
      console.log(`  Left alone (changed since review): ${m.stripe_customer_id} ${m.email}`);
      skipped++;
      continue;
    }
    await stripe.customers.del(m.stripe_customer_id);
    deleted++;
  }
  console.log(`Deleted ${deleted} Stripe customers, left ${skipped} alone`);
  console.log("Done.");
}

if (mode === "review") await runReview();
else await runExecute();
