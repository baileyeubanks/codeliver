import { requireAuth } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access-control";
import {
  handleBillingCheckout,
  type BillingCheckoutMilestone,
} from "@/lib/covideopro/checkout.server";
import { createStripeCheckoutProvider } from "@/lib/covideopro/payments.server";
import { getAdminSiteUrl } from "@/lib/server-env";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const CHECKOUT_RATE_LIMIT = 5;
const CHECKOUT_RATE_WINDOW_SECONDS = 60;

function normalizeMilestone(
  row: Record<string, unknown>,
): BillingCheckoutMilestone {
  const amountCents = Number(row.amount_cents);
  const status = row.status;
  if (
    typeof row.id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.label !== "string" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    (status !== "pending" &&
      status !== "checkout_created" &&
      status !== "paid" &&
      status !== "void")
  ) {
    throw new Error("Invalid payment milestone authority record");
  }

  return {
    id: row.id,
    project_id: row.project_id,
    label: row.label,
    amount_cents: amountCents,
    currency: row.currency,
    status,
    checkout_url:
      typeof row.checkout_url === "string" ? row.checkout_url : null,
    checkout_provider:
      typeof row.checkout_provider === "string"
        ? row.checkout_provider
        : null,
  };
}

async function loadMilestone(
  milestoneId: string,
): Promise<BillingCheckoutMilestone | null> {
  const result = await getSupabase()
    .from("payment_milestones")
    .select(
      "id, project_id, label, amount_cents, currency, status, checkout_url, checkout_provider",
    )
    .eq("id", milestoneId)
    .maybeSingle();

  if (result.error) throw new Error("Milestone lookup failed");
  return result.data
    ? normalizeMilestone(result.data as Record<string, unknown>)
    : null;
}

async function requireProjectAdmin(projectId: string, userId: string) {
  const access = await getProjectAccess(
    projectId,
    userId,
    "admin",
    getSupabase(),
  );
  if (!access.ok && access.status >= 500) {
    throw new Error("Project authority lookup failed");
  }
  return access.ok;
}

async function reserveCheckoutRateLimit(projectId: string, userId: string) {
  const reservation = await getSupabase().rpc(
    "reserve_checkout_rate_limit",
    {
      p_actor_id: userId,
      p_project_id: projectId,
      p_limit: CHECKOUT_RATE_LIMIT,
      p_window_seconds: CHECKOUT_RATE_WINDOW_SECONDS,
    },
  );
  if (reservation.error) {
    throw new Error("Checkout rate limit reservation failed");
  }

  const row = Array.isArray(reservation.data)
    ? reservation.data[0]
    : reservation.data;
  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof row.retry_after_seconds !== "number"
  ) {
    throw new Error("Checkout rate authority returned an invalid result");
  }

  if (row.allowed) {
    const audit = await getSupabase().from("activity_log").insert({
      project_id: projectId,
      actor_id: userId,
      actor_name: "Authenticated operator",
      action: "payment_checkout_authorized",
      details: {
        limit: CHECKOUT_RATE_LIMIT,
        window_seconds: CHECKOUT_RATE_WINDOW_SECONDS,
      },
    });
    if (audit.error) {
      throw new Error("Checkout authority audit failed");
    }
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

async function saveCheckoutSession({
  milestoneId,
  projectId,
  provider,
  url,
}: {
  milestoneId: string;
  projectId: string;
  provider: string;
  url: string;
}) {
  const result = await getSupabase()
    .from("payment_milestones")
    .update({
      status: "checkout_created",
      method: "checkout",
      checkout_url: url,
      checkout_provider: provider,
      updated_at: new Date().toISOString(),
    })
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (result.error) throw new Error("Checkout persistence failed");
  return Boolean(result.data);
}

export async function POST(request: Request) {
  const stripe = createStripeCheckoutProvider();
  return handleBillingCheckout(request, {
    authenticate: requireAuth,
    loadMilestone,
    authorizeProject: requireProjectAdmin,
    reserveRateLimit: reserveCheckoutRateLimit,
    createSession: (checkout) => stripe.createSession(checkout),
    saveSession: saveCheckoutSession,
    getSiteUrl: getAdminSiteUrl,
  });
}
