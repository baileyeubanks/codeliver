import { NextResponse } from "next/server";
import { MeteringError, type MeteringActor } from "../metering";
import { ControlPlaneUnavailableError } from "./local-control-plane";
import { VaultError } from "./policy";
import type { VaultActor, VaultRole, VaultScope } from "./types";

type Input = Record<string, unknown>;

const VAULT_ROLES: readonly VaultRole[] = [
  "owner",
  "admin",
  "creator",
  "auditor",
  "agent",
  "service",
  "reviewer",
  "client",
];

export async function readJsonObject(request: Request): Promise<Input> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new VaultError("invalid_json", "Request body must be a JSON object");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new VaultError("invalid_json", "Request body must be a JSON object");
  }
  return value as Input;
}

export function stringField(input: Input, snake: string, camel = snake): string {
  const value = input[snake] ?? input[camel];
  if (typeof value !== "string" || !value.trim()) {
    throw new VaultError("missing_field", `${snake} is required`);
  }
  return value.trim();
}

export function optionalStringField(input: Input, snake: string, camel = snake) {
  const value = input[snake] ?? input[camel];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new VaultError("invalid_field", `${snake} must be a string`);
  return value;
}

export function objectField(input: Input, snake: string, camel = snake): Input {
  const value = input[snake] ?? input[camel];
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new VaultError("invalid_field", `${snake} must be an object`);
  }
  return value as Input;
}

export function arrayField<T = unknown>(input: Input, snake: string, camel = snake): T[] {
  const value = input[snake] ?? input[camel];
  if (!Array.isArray(value)) throw new VaultError("invalid_field", `${snake} must be an array`);
  return value as T[];
}

export function scopeFromInput(input: Input): VaultScope {
  return {
    organizationId: stringField(input, "organization_id", "organizationId"),
    projectId: stringField(input, "project_id", "projectId"),
  };
}

export function scopeFromSearchParams(params: URLSearchParams): VaultScope {
  const organizationId = params.get("organization_id") ?? params.get("organizationId");
  const projectId = params.get("project_id") ?? params.get("projectId");
  if (!organizationId || !projectId) {
    throw new VaultError("missing_scope", "organization_id and project_id are required");
  }
  return { organizationId, projectId };
}

function requestedRole(request: Request): VaultRole {
  const role = request.headers.get("x-cco-demo-role") ?? "owner";
  if (!VAULT_ROLES.includes(role as VaultRole)) {
    throw new VaultError("invalid_demo_role", "x-cco-demo-role is invalid");
  }
  return role as VaultRole;
}

function roleCapabilities(role: VaultRole): VaultActor["capabilities"] {
  switch (role) {
    case "owner":
    case "admin":
      return [
        "vault:read",
        "vault:write",
        "vault:retrieve",
        "vault:export",
        "agent:plan",
        "agent:submit_output",
        "agent:approve",
        "agent:cancel",
        "agent:rollback",
        "agent:audit",
      ];
    case "creator":
      return [
        "vault:read",
        "vault:write",
        "vault:retrieve",
        "agent:plan",
        "agent:approve",
        "agent:cancel",
        "agent:rollback",
      ];
    case "auditor":
      return ["vault:read", "vault:retrieve", "vault:export", "agent:audit"];
    case "agent":
      return [
        "vault:read",
        "vault:retrieve",
        "agent:plan",
        "agent:submit_output",
        "agent:cancel",
      ];
    case "service":
      return [
        "vault:read",
        "vault:write",
        "vault:retrieve",
        "vault:export",
        "agent:plan",
        "agent:submit_output",
        "agent:approve",
        "agent:cancel",
        "agent:rollback",
        "agent:audit",
      ];
    default:
      return ["vault:read"];
  }
}

export function localVaultActor(request: Request): VaultActor {
  const role = requestedRole(request);
  const id = request.headers.get("x-cco-demo-actor-id")?.trim() || `demo-${role}`;
  return {
    id,
    role,
    kind: role === "agent" ? "agent" : role === "service" ? "service" : "human",
    capabilities: roleCapabilities(role),
  };
}

export function localMeteringActor(request: Request): MeteringActor {
  const vaultActor = localVaultActor(request);
  const role: MeteringActor["role"] =
    vaultActor.role === "owner" || vaultActor.role === "admin"
      ? vaultActor.role
      : vaultActor.role === "auditor"
        ? "auditor"
        : vaultActor.role === "reviewer" || vaultActor.role === "client"
          ? vaultActor.role
          : vaultActor.role === "service"
            ? "service"
            : "creator";
  return { id: vaultActor.id, role, kind: vaultActor.kind };
}

export function jsonError(error: unknown) {
  if (error instanceof MeteringError || error instanceof VaultError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ControlPlaneUnavailableError) {
    return NextResponse.json(
      { error: error.message, code: "control_plane_unavailable" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Control plane request failed", code: "control_plane_error" },
    { status: 500 },
  );
}

export function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(value, { ...init, headers });
}
