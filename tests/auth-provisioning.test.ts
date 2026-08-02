import assert from "node:assert/strict";
import test from "node:test";

import {
  listConfirmedStaffCandidates,
  mergeProvisionedRole,
  planProvisioning,
  resolveProvisionedRole,
  type ProvisioningUser,
} from "../lib/auth/provisioning.ts";

const users: ProvisioningUser[] = [
  {
    id: "staff-approved",
    email: " Producer@ContentCo-op.com ",
    email_confirmed_at: "2026-07-15T00:00:00.000Z",
    app_metadata: { provider: "email", tenant: "content-co-op" },
  },
  {
    id: "staff-unconfirmed",
    email: "pending@contentco-op.com",
    email_confirmed_at: null,
    app_metadata: {},
  },
  {
    id: "staff-subdomain",
    email: "producer@studio.contentco-op.com",
    email_confirmed_at: "2026-07-15T00:00:00.000Z",
    app_metadata: {},
  },
  {
    id: "client-approved",
    email: "reviewer@example.com",
    email_confirmed_at: "2026-07-15T00:00:00.000Z",
    app_metadata: { invitation_id: "invite-42" },
  },
  {
    id: "already-client",
    email: "owner@example.net",
    email_confirmed_at: "2026-07-15T00:00:00.000Z",
    app_metadata: { content_coop_role: "client", source: "invite" },
  },
];

test("staff candidates require confirmed exact-domain Auth identities", () => {
  assert.deepEqual(listConfirmedStaffCandidates(users), [
    {
      userId: "staff-approved",
      email: "producer@contentco-op.com",
      emailConfirmedAt: "2026-07-15T00:00:00.000Z",
      currentRole: null,
    },
  ]);
});

test("only the namespaced app_metadata role is treated as provisioned authority", () => {
  assert.equal(resolveProvisionedRole({ app_metadata: { content_coop_role: "staff" } }), "staff");
  assert.equal(resolveProvisionedRole({ app_metadata: { content_coop_role: "client" } }), "client");
  assert.equal(resolveProvisionedRole({ app_metadata: { role: "admin" } }), null);
  assert.equal(resolveProvisionedRole({ app_metadata: { roles: ["staff"] } }), null);
  assert.equal(resolveProvisionedRole({ app_metadata: { content_coop_role: "Staff" } }), null);
});

test("role metadata merges preserve unrelated server-controlled claims", () => {
  assert.deepEqual(
    mergeProvisionedRole({ provider: "email", tenant: "content-co-op" }, "staff"),
    {
      provider: "email",
      tenant: "content-co-op",
      content_coop_role: "staff",
    },
  );
});

test("dry-run planning requires explicit IDs and never infers client authority", () => {
  assert.deepEqual(
    planProvisioning(users, {
      apply: false,
      staffUserIds: [],
      clientUserIds: [],
    }),
    [],
  );

  const decisions = planProvisioning(users, {
    apply: false,
    staffUserIds: ["staff-approved"],
    clientUserIds: ["client-approved", "already-client"],
  });

  assert.deepEqual(decisions.map(({ userId, requestedRole, outcome }) => ({ userId, requestedRole, outcome })), [
    { userId: "staff-approved", requestedRole: "staff", outcome: "eligible" },
    { userId: "client-approved", requestedRole: "client", outcome: "eligible" },
    { userId: "already-client", requestedRole: "client", outcome: "unchanged" },
  ]);
  assert.deepEqual(decisions[0].nextAppMetadata, {
    provider: "email",
    tenant: "content-co-op",
    content_coop_role: "staff",
  });
  assert.deepEqual(decisions[1].nextAppMetadata, {
    invitation_id: "invite-42",
    content_coop_role: "client",
  });
});

test("apply mode fails closed for empty or invalid approval sets", () => {
  assert.throws(
    () => planProvisioning(users, { apply: true, staffUserIds: [], clientUserIds: [] }),
    /explicitly approved user ID/,
  );

  const rejected = planProvisioning(users, {
    apply: true,
    staffUserIds: ["staff-unconfirmed", "staff-subdomain", "missing", "client-approved"],
    clientUserIds: ["client-approved"],
  });

  assert.equal(rejected.every((decision) => decision.outcome === "rejected"), true);
  assert.match(rejected.find((decision) => decision.userId === "staff-unconfirmed")?.reason ?? "", /confirmed/);
  assert.match(rejected.find((decision) => decision.userId === "staff-subdomain")?.reason ?? "", /exact @contentco-op\.com/);
  assert.match(rejected.find((decision) => decision.userId === "missing")?.reason ?? "", /not found/);
  assert.equal(
    rejected.filter((decision) => decision.userId === "client-approved").every((decision) => /both staff and client/.test(decision.reason ?? "")),
    true,
  );
});
