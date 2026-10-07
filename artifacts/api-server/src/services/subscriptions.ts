import type { Logger } from "pino";
import { and, eq } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { patchClerkPublicMetadata, fetchAllClerkUsers, ADMIN_IDS } from "../routes/admin.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Odstęp między wywołaniami Clerk API w pętlach masowych (backfill/resync) — bez tego
// realny incydent (2026-09-15): backfill 5 userów naraz bez throttlingu → wszystkie 5
// synców planu do Clerk ciche-nieudane (prawdopodobnie rate-limit API Clerka).
const CLERK_CALL_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nadaje 30-dniowy trial planu `pro` userowi, jeśli jeszcze go nie ma (idempotentne —
// `onConflictDoNothing` na unikalnym user_id to "claim", jak w email_log). Przy sukcesie
// od razu synchronizuje Clerk.publicMetadata.plan='pro', żeby req.plan w requireUser.ts
// (i limity AI z ai-plan.ts) widziały 'pro' NATYCHMIAST — bez żadnej zmiany w requireUser.ts.
export async function startTrialForUser(userId: string, log: Logger, days = 30): Promise<boolean> {
  const trialEndsAt = new Date(Date.now() + days * DAY_MS);

  const [row] = await db
    .insert(subscriptionsTable)
    .values({ userId, status: "trialing", plan: "pro", trialEndsAt })
    .onConflictDoNothing({ target: subscriptionsTable.userId })
    .returning({ id: subscriptionsTable.id });

  if (!row) return false; // już miał subskrypcję — nic nie robimy

  const synced = await patchClerkPublicMetadata(userId, { plan: "pro" }, log);
  if (!synced) {
    log.warn({ userId }, "Trial nadany w bazie, ale sync planu do Clerk nieudany");
  }
  return true;
}

export type EffectivePlanStatus = {
  plan: "free" | "pro" | "business";
  status: "trialing" | "active" | "past_due" | "canceled" | "none";
  trialEndsAt: string | null;
  daysLeft: number | null;
};

// Czyta stan subskrypcji; jeśli trial już minął, LENIWIE (przy tym wywołaniu) przełącza
// na canceled/free w bazie i w Clerk. Woływane z GET /subscription/status — nie z
// requireUser.ts (koszt zapytania do DB na KAŻDY request nie ma dziś uzasadnienia,
// skoro nic jeszcze nie płaci; pełne, niezależne od logowania sprzątanie to Faza B).
export async function getEffectivePlanStatus(userId: string, log: Logger): Promise<EffectivePlanStatus> {
  const [row] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
  if (!row) return { plan: "free", status: "none", trialEndsAt: null, daysLeft: null };

  const now = Date.now();
  if (row.status === "trialing" && row.trialEndsAt && row.trialEndsAt.getTime() < now) {
    await db
      .update(subscriptionsTable)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "trialing")));
    const synced = await patchClerkPublicMetadata(userId, { plan: "free" }, log);
    if (!synced) {
      log.warn({ userId }, "Trial wygasł, ale sync planu do Clerk (free) nieudany");
    }
    return { plan: "free", status: "canceled", trialEndsAt: row.trialEndsAt.toISOString(), daysLeft: 0 };
  }

  const daysLeft = row.trialEndsAt
    ? Math.max(0, Math.ceil((row.trialEndsAt.getTime() - now) / DAY_MS))
    : null;
  const plan = row.status === "trialing" || row.status === "active" ? (row.plan as "pro" | "business") : "free";

  return {
    plan,
    status: row.status as EffectivePlanStatus["status"],
    trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
    daysLeft,
  };
}

export type TrialBackfillResult = { totalUsers: number; started: number; alreadyHadSubscription: number };

// Nadaje trial WSZYSTKIM zarejestrowanym userom poza adminami (ten sam wzorzec pętli
// co broadcasty maili w admin-broadcast.ts, ale to zapisy do DB/Clerk — szybsze,
// bez potrzeby throttlingu na Resend). Wołane z routes/admin.ts: /admin/backfill-trial.
export async function backfillTrialForAllUsers(log: Logger): Promise<TrialBackfillResult> {
  const { data: users } = await fetchAllClerkUsers();
  let started = 0;
  let alreadyHadSubscription = 0;

  for (const u of users) {
    if (ADMIN_IDS.includes(u.id)) continue;
    const didStart = await startTrialForUser(u.id, log);
    if (didStart) started++;
    else alreadyHadSubscription++;
    await sleep(CLERK_CALL_DELAY_MS);
  }

  log.info({ totalUsers: users.length, started, alreadyHadSubscription }, "Backfill triala zakończony");
  return { totalUsers: users.length, started, alreadyHadSubscription };
}

export type TrialExtendResult = {
  totalUsers: number;
  extended: number; // trial trwał — przesunięty o `days`
  reactivated: number; // trial wygasł (canceled, bez płatności) — wznowiony na `days` od dziś
  started: number; // nie miał subskrypcji — nowy trial na `days`
  skipped: number; // płatny plan albo trial już przedłużony (>= `days` do końca)
  clerkFailed: number;
};

// Przedłuża okres próbny WSZYSTKIM userom (poza adminami) o `days` dni (decyzja usera
// 2026-10-07: „przedłuż każdemu o miesiąc”). Nowy koniec = max(koniec triala, teraz) + days.
// Bezpieczne przy ponownym kliknięciu w ciągu doby: pomija trial, któremu zostało już
// >= `days - 1` dni — po pierwszym przebiegu każdy przedłużony ma co najmniej `days`.
// Płatnych subskrypcji (provider != 'none' albo status active/past_due) nie rusza.
export async function extendTrialForAllUsers(log: Logger, days = 30): Promise<TrialExtendResult> {
  const { data: users } = await fetchAllClerkUsers();
  const rows = await db.select().from(subscriptionsTable);
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  const now = Date.now();
  const result: TrialExtendResult = { totalUsers: users.length, extended: 0, reactivated: 0, started: 0, skipped: 0, clerkFailed: 0 };

  for (const u of users) {
    if (ADMIN_IDS.includes(u.id)) continue;
    const row = byUser.get(u.id);

    if (!row) {
      if (await startTrialForUser(u.id, log, days)) result.started++;
      else result.skipped++;
      await sleep(CLERK_CALL_DELAY_MS);
      continue;
    }

    const isTrialOnly = row.provider === "none" && (row.status === "trialing" || row.status === "canceled");
    const endsAt = row.trialEndsAt?.getTime() ?? now;
    // Próg `days - 1`, nie `days`: wznowiony/nowy trial ma DOKŁADNIE `days` dni, a sekundy
    // później już mniej — bez marginesu drugie kliknięcie przedłużyłoby go ponownie
    // (złapane testem). Koszt: trial założony w ostatniej dobie nie dostaje dodatkowych dni.
    if (!isTrialOnly || (row.status === "trialing" && endsAt - now >= (days - 1) * DAY_MS)) {
      result.skipped++;
      continue;
    }

    const wasExpired = row.status === "canceled" || endsAt < now;
    const trialEndsAt = new Date(Math.max(endsAt, now) + days * DAY_MS);
    await db
      .update(subscriptionsTable)
      .set({ status: "trialing", trialEndsAt, updatedAt: new Date() })
      .where(eq(subscriptionsTable.userId, u.id));
    if (wasExpired) result.reactivated++;
    else result.extended++;

    const synced = await patchClerkPublicMetadata(u.id, { plan: row.plan as "pro" | "business" }, log);
    if (!synced) {
      result.clerkFailed++;
      log.warn({ userId: u.id }, "Trial przedłużony w bazie, ale sync planu do Clerk nieudany");
    }
    await sleep(CLERK_CALL_DELAY_MS);
  }

  log.info(result, "Przedłużenie triala zakończone");
  return result;
}

export type ClerkResyncResult = { totalSubscriptions: number; synced: number; failed: number };

// Naprawcze: przechodzi po WSZYSTKICH wierszach subscriptions (niezależnie czy świeżo
// wstawione) i wymusza ponowny sync Clerk.publicMetadata.plan zgodnie z ich realnym
// stanem (trialing/active → subscription.plan, past_due/canceled → 'free'). Do użycia,
// gdy patchClerkPublicMetadata zawiodło przy nadawaniu triala (patrz log ostrzeżenia
// "sync planu do Clerk nieudany") — wołane z routes/admin.ts: /admin/resync-clerk-plan.
export async function resyncClerkPlanForAllSubscriptions(log: Logger): Promise<ClerkResyncResult> {
  const rows = await db.select().from(subscriptionsTable);
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const plan = row.status === "trialing" || row.status === "active" ? row.plan : "free";
    const ok = await patchClerkPublicMetadata(row.userId, { plan }, log);
    if (ok) synced++;
    else failed++;
    await sleep(CLERK_CALL_DELAY_MS);
  }

  log.info({ totalSubscriptions: rows.length, synced, failed }, "Resync planu do Clerk zakończony");
  return { totalSubscriptions: rows.length, synced, failed };
}
