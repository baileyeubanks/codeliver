#!/usr/bin/env -S node --experimental-strip-types

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createClient, type User } from "@supabase/supabase-js";
import {
  listConfirmedStaffCandidates,
  planProvisioning,
  type ProvisioningApproval,
  type ProvisioningDecision,
  type ProvisioningUser,
} from "../../lib/auth/provisioning.ts";

const RECEIPT_SCHEMA_VERSION = 1;
const PAGE_SIZE = 1000;

interface CommandOptions extends ProvisioningApproval {
  approvalFile: string | null;
  receiptPath: string | null;
  help: boolean;
}

interface ApprovalFile {
  staffUserIds?: unknown;
  clientUserIds?: unknown;
}

interface ApplyResult {
  userId: string;
  requestedRole: "staff" | "client";
  status: "planned" | "unchanged" | "applied" | "failed" | "rejected";
  detail: string | null;
}

function usage(): string {
  return `Co-Deliver Auth role bootstrap (dry-run by default)

Usage:
  node --experimental-strip-types scripts/auth/bootstrap-roles.ts
  node --experimental-strip-types scripts/auth/bootstrap-roles.ts --staff-user-id <uuid>
  node --experimental-strip-types scripts/auth/bootstrap-roles.ts --client-user-id <uuid>
  node --experimental-strip-types scripts/auth/bootstrap-roles.ts --approval-file approvals.json
  node --experimental-strip-types scripts/auth/bootstrap-roles.ts --apply --approval-file approvals.json

Options:
  --apply                    Perform approved writes. Omit for dry-run.
  --staff-user-id <uuid>     Explicitly approve one confirmed @contentco-op.com user.
  --client-user-id <uuid>    Explicitly approve one confirmed client user. No domain inference.
  --approval-file <path>     JSON with staffUserIds and/or clientUserIds arrays.
  --receipt <path>           Override the secret-free audit receipt path.
  --help                     Show this help.

Required environment:
  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)`;
}

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): CommandOptions {
  const options: CommandOptions = {
    apply: false,
    staffUserIds: [],
    clientUserIds: [],
    approvalFile: null,
    receiptPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--staff-user-id") {
      options.staffUserIds.push(valueAfter(argv, index, argument));
      index += 1;
    } else if (argument.startsWith("--staff-user-id=")) {
      options.staffUserIds.push(argument.slice("--staff-user-id=".length));
    } else if (argument === "--client-user-id") {
      options.clientUserIds.push(valueAfter(argv, index, argument));
      index += 1;
    } else if (argument.startsWith("--client-user-id=")) {
      options.clientUserIds.push(argument.slice("--client-user-id=".length));
    } else if (argument === "--approval-file") {
      options.approvalFile = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument.startsWith("--approval-file=")) {
      options.approvalFile = argument.slice("--approval-file=".length);
    } else if (argument === "--receipt") {
      options.receiptPath = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument.startsWith("--receipt=")) {
      options.receiptPath = argument.slice("--receipt=".length);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of Auth user IDs.`);
  }
  return value;
}

async function mergeApprovalFile(options: CommandOptions): Promise<CommandOptions> {
  if (!options.approvalFile) return options;
  const parsed = JSON.parse(
    await readFile(resolve(options.approvalFile), "utf8"),
  ) as ApprovalFile;

  return {
    ...options,
    staffUserIds: [
      ...options.staffUserIds,
      ...stringArray(parsed.staffUserIds, "staffUserIds"),
    ],
    clientUserIds: [
      ...options.clientUserIds,
      ...stringArray(parsed.clientUserIds, "clientUserIds"),
    ],
  };
}

function environment(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase URL and service-role credentials are required.");
  }

  return { url, serviceRoleKey };
}

function defaultReceiptPath(startedAt: string): string {
  const stamp = startedAt.replaceAll(":", "-");
  return resolve(
    homedir(),
    ".local",
    "state",
    "content-co-op",
    "auth-provisioning",
    `role-bootstrap-${stamp}.json`,
  );
}

async function allAuthUsers(
  admin: ReturnType<typeof createClient>["auth"]["admin"],
): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`Auth user listing failed: ${error.message}`);
    users.push(...data.users);

    if (data.users.length < PAGE_SIZE || users.length >= data.total) return users;
  }
}

function safeDetail(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : "Unknown provisioning failure";
  return message.replaceAll(secret, "[REDACTED]");
}

function plannedResults(decisions: ProvisioningDecision[]): ApplyResult[] {
  return decisions.map((decision) => ({
    userId: decision.userId,
    requestedRole: decision.requestedRole,
    status:
      decision.outcome === "eligible"
        ? "planned"
        : decision.outcome === "unchanged"
          ? "unchanged"
          : "rejected",
    detail: decision.reason,
  }));
}

async function main() {
  const startedAt = new Date().toISOString();
  let options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  options = await mergeApprovalFile(options);

  if (
    options.apply &&
    options.staffUserIds.length === 0 &&
    options.clientUserIds.length === 0
  ) {
    throw new Error("Apply mode requires at least one explicitly approved user ID.");
  }

  const { url, serviceRoleKey } = environment();
  const receiptPath = resolve(options.receiptPath ?? defaultReceiptPath(startedAt));
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const users = await allAuthUsers(supabase.auth.admin);
  const provisioningUsers = users as ProvisioningUser[];
  const staffCandidates = listConfirmedStaffCandidates(provisioningUsers);
  const decisions = planProvisioning(provisioningUsers, options);
  const rejected = decisions.filter((decision) => decision.outcome === "rejected");
  const results = plannedResults(decisions);
  let status: "dry-run" | "applied" | "rejected" | "failed" = options.apply
    ? "applied"
    : "dry-run";

  try {
    if (options.apply && rejected.length > 0) {
      status = "rejected";
      throw new Error("Provisioning preflight rejected one or more approved user IDs; no writes were made.");
    }

    if (options.apply) {
      for (const decision of decisions) {
        if (decision.outcome !== "eligible" || !decision.nextAppMetadata) continue;
        const result = results.find((entry) => entry.userId === decision.userId && entry.requestedRole === decision.requestedRole);
        const { error } = await supabase.auth.admin.updateUserById(decision.userId, {
          app_metadata: decision.nextAppMetadata,
        });
        if (error) {
          status = "failed";
          if (result) {
            result.status = "failed";
            result.detail = safeDetail(error, serviceRoleKey);
          }
          throw new Error(`Role assignment failed for approved user ${decision.userId}.`);
        }
        if (result) result.status = "applied";
      }
    }
  } catch (error) {
    if (status !== "rejected") status = "failed";
    throw error;
  } finally {
    const receipt = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      startedAt,
      completedAt: new Date().toISOString(),
      mode: options.apply ? "apply" : "dry-run",
      status,
      authProjectHost: new URL(url).host,
      staffCandidates,
      approvals: {
        staffUserIds: [...new Set(options.staffUserIds)],
        clientUserIds: [...new Set(options.clientUserIds)],
      },
      results,
    };
    await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(JSON.stringify({ receiptPath, ...receipt }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Auth bootstrap failed.");
  process.exitCode = 1;
});
