import {
  PaymentsNotConfiguredError,
  type CheckoutSessionRequest,
  type CheckoutSessionResult,
} from "./payments.ts";

const MAX_CHECKOUT_BODY_BYTES = 4_096;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutUser = {
  id: string;
  email?: string | null;
};

export interface BillingCheckoutMilestone {
  id: string;
  project_id: string;
  label: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "checkout_created" | "paid" | "void";
  checkout_url: string | null;
  checkout_provider: string | null;
}

type RateLimitReservation = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type SavedCheckout = {
  milestoneId: string;
  projectId: string;
  provider: string;
  url: string;
};

export interface BillingCheckoutDependencies {
  authenticate(): Promise<CheckoutUser | null>;
  loadMilestone(milestoneId: string): Promise<BillingCheckoutMilestone | null>;
  authorizeProject(projectId: string, userId: string): Promise<boolean>;
  reserveRateLimit(
    projectId: string,
    userId: string,
  ): Promise<RateLimitReservation>;
  createSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>;
  saveSession(checkout: SavedCheckout): Promise<boolean>;
  getSiteUrl(): string;
}

function json(
  body: Record<string, unknown>,
  status: number,
  headers?: HeadersInit,
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function readCheckoutBody(
  request: Request,
): Promise<
  | { ok: true; milestoneId: string }
  | { ok: false; response: Response }
> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CHECKOUT_BODY_BYTES
  ) {
    return {
      ok: false,
      response: json(
        { error: "Request body is too large", code: "INVALID_REQUEST" },
        413,
      ),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: json(
        { error: "Request body is invalid", code: "INVALID_REQUEST" },
        400,
      ),
    };
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_CHECKOUT_BODY_BYTES) {
    return {
      ok: false,
      response: json(
        { error: "Request body is too large", code: "INVALID_REQUEST" },
        413,
      ),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: json(
        { error: "Request body must be valid JSON", code: "INVALID_REQUEST" },
        400,
      ),
    };
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("milestone_id" in body) ||
    typeof body.milestone_id !== "string" ||
    !UUID_PATTERN.test(body.milestone_id)
  ) {
    return {
      ok: false,
      response: json(
        {
          error: "Request must contain only a valid milestone_id",
          code: "INVALID_REQUEST",
        },
        400,
      ),
    };
  }

  return { ok: true, milestoneId: body.milestone_id };
}

function checkoutPayload(
  milestoneId: string,
  provider: string,
  url: string,
  reused: boolean,
) {
  return {
    checkout: {
      milestone_id: milestoneId,
      provider,
      url,
      reused,
    },
  };
}

export async function handleBillingCheckout(
  request: Request,
  dependencies: BillingCheckoutDependencies,
): Promise<Response> {
  let user: CheckoutUser | null;
  try {
    user = await dependencies.authenticate();
  } catch {
    return json(
      {
        error: "Authentication service is unavailable",
        code: "AUTH_UNAVAILABLE",
      },
      503,
    );
  }

  if (!user) {
    return json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      401,
    );
  }

  const body = await readCheckoutBody(request);
  if (!body.ok) return body.response;

  let milestone: BillingCheckoutMilestone | null;
  try {
    milestone = await dependencies.loadMilestone(body.milestoneId);
  } catch {
    return json(
      {
        error: "Checkout authority is unavailable",
        code: "BACKEND_UNAVAILABLE",
      },
      503,
    );
  }
  if (!milestone) {
    return json(
      { error: "Payment milestone not found", code: "MILESTONE_NOT_FOUND" },
      404,
    );
  }

  let authorized: boolean;
  try {
    authorized = await dependencies.authorizeProject(
      milestone.project_id,
      user.id,
    );
  } catch {
    return json(
      {
        error: "Checkout authority is unavailable",
        code: "BACKEND_UNAVAILABLE",
      },
      503,
    );
  }
  if (!authorized) {
    return json(
      {
        error: "Project administrator access required",
        code: "PROJECT_ADMIN_REQUIRED",
      },
      403,
    );
  }

  if (
    milestone.status === "checkout_created" &&
    milestone.checkout_url &&
    milestone.checkout_provider
  ) {
    return json(
      checkoutPayload(
        milestone.id,
        milestone.checkout_provider,
        milestone.checkout_url,
        true,
      ),
      200,
    );
  }
  if (milestone.status !== "pending") {
    return json(
      {
        error: "Payment milestone is not available for checkout",
        code: "CHECKOUT_NOT_AVAILABLE",
      },
      409,
    );
  }

  let rate: RateLimitReservation;
  try {
    rate = await dependencies.reserveRateLimit(
      milestone.project_id,
      user.id,
    );
  } catch {
    return json(
      {
        error: "Checkout rate authority is unavailable",
        code: "CHECKOUT_RATE_LIMIT_UNAVAILABLE",
      },
      503,
    );
  }
  if (!rate.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(rate.retryAfterSeconds),
    );
    return json(
      {
        error: "Checkout creation rate exceeded",
        code: "CHECKOUT_RATE_LIMITED",
      },
      429,
      { "Retry-After": String(retryAfterSeconds) },
    );
  }

  let siteUrl: string;
  try {
    siteUrl = dependencies.getSiteUrl();
  } catch {
    return json(
      {
        error: "Checkout configuration is unavailable",
        code: "CHECKOUT_CONFIGURATION_UNAVAILABLE",
      },
      503,
    );
  }
  const returnUrl = new URL(`/projects/${milestone.project_id}`, siteUrl);
  returnUrl.searchParams.set("checkout", "success");
  returnUrl.searchParams.set("milestone_id", milestone.id);
  const cancelUrl = new URL(returnUrl);
  cancelUrl.searchParams.set("checkout", "cancelled");

  let session: CheckoutSessionResult;
  try {
    session = await dependencies.createSession({
      milestoneId: milestone.id,
      label: milestone.label,
      amountCents: milestone.amount_cents,
      currency: milestone.currency,
      customerEmail: user.email ?? null,
      successUrl: returnUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) {
      return json(
        {
          error: "Checkout is not configured",
          code: "PAYMENTS_NOT_CONFIGURED",
        },
        503,
      );
    }
    return json(
      {
        error: "Checkout provider is unavailable",
        code: "CHECKOUT_PROVIDER_UNAVAILABLE",
      },
      502,
    );
  }

  let saved: boolean;
  try {
    saved = await dependencies.saveSession({
      milestoneId: milestone.id,
      projectId: milestone.project_id,
      provider: session.provider,
      url: session.url,
    });
  } catch {
    saved = false;
  }
  if (!saved) {
    return json(
      {
        error: "Checkout result could not be recorded",
        code: "CHECKOUT_PERSISTENCE_FAILED",
      },
      503,
    );
  }

  return json(
    checkoutPayload(milestone.id, session.provider, session.url, false),
    201,
  );
}
