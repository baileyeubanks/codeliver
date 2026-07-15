import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  IntegrationControlError,
  IntegrationControlPlane,
} from "@/lib/integrations/control-plane";
import type {
  IntegrationExecutionContext,
  IntegrationPermission,
} from "@/lib/integrations/contracts";
import { getTeamRole } from "@/lib/middleware/rbac";
import type { TeamRole } from "@/lib/types/codeliver";

const MAX_REQUEST_BYTES = 16_384;
const controlPlane = new IntegrationControlPlane();

const ROLE_PERMISSIONS: Record<TeamRole, ReadonlySet<IntegrationPermission>> = {
  owner: new Set([
    "integrations.inspect",
    "integrations.configure",
    "integrations.enable",
    "integrations.preview",
    "integrations.request_delivery",
    "integrations.cancel",
  ]),
  admin: new Set([
    "integrations.inspect",
    "integrations.configure",
    "integrations.enable",
    "integrations.preview",
    "integrations.request_delivery",
    "integrations.cancel",
  ]),
  member: new Set(["integrations.inspect", "integrations.preview"]),
  viewer: new Set(["integrations.inspect"]),
};

type ContextResult =
  | { ok: true; context: IntegrationExecutionContext }
  | { ok: false; response: NextResponse };

async function deriveContext(request: Request): Promise<ContextResult> {
  const user = await requireAuth();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
        { status: 401 },
      ),
    };
  }

  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "TENANT_REQUIRED", message: "A tenant context is required." } },
        { status: 400 },
      ),
    };
  }

  const role = await getTeamRole(tenantId, user.id);
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Tenant access is not permitted." } },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    context: {
      tenantId,
      actorId: user.id,
      permissions: ROLE_PERMISSIONS[role],
    },
  };
}

function errorResponse(error: unknown) {
  if (error instanceof IntegrationControlError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message: "The request could not be processed." } },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const derived = await deriveContext(request);
  if (!derived.ok) return derived.response;

  try {
    return NextResponse.json(
      {
        schemaVersion: "integration-control-view/v1",
        mode: "dry_run_only",
        message: "Integration controls are available. Live delivery is unavailable.",
        liveDeliveryAvailable: false,
        configurations: controlPlane.listConfigurations(derived.context),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const derived = await deriveContext(request);
  if (!derived.ok) return derived.response;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: { code: "RESOURCE_LIMIT", message: "The request is larger than the safe limit." } },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "RESOURCE_LIMIT",
            message: "The request is larger than the safe limit.",
          },
        },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }
    const command: unknown = JSON.parse(text);
    const result = controlPlane.execute(derived.context, command);
    return NextResponse.json(
      {
        ...result,
        mode: "dry_run_only",
        liveDeliveryAvailable: false,
        audit: controlPlane.toSafeAuditEvent(result.receipt),
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
