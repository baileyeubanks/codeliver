import assert from "node:assert/strict";
import test from "node:test";

import {
  accessibleForeground,
  contrastRatio,
  createBrandDraft,
  createRollbackDraft,
  discardBrandDraft,
  migrateLegacyBrand,
  normalizeHexColor,
  PLATFORM_BRAND_VALUES,
  publishBrandRevision,
  resolveBrand,
  restoreBrandRevisions,
} from "../packages/brand/src/governance.ts";

const context = {
  organizationId: "org-content-coop",
  workspaceId: "workspace-co-deliver",
};

const legacy = {
  displayName: "Content Co-op",
  playerLabel: "Reviewed with Content Co-op",
  primaryColor: "#4c8ef5",
  logoPath: "/demo/cco-spiral.png",
};

test("platform branding resolves to the definitive Co-VideoPro raster", () => {
  assert.deepEqual(PLATFORM_BRAND_VALUES, {
    displayName: "Co-VideoPro",
    playerLabel: "Reviewed in Co-VideoPro",
    primaryColor: "#145bb8",
    logoPath: "/brand/co-videopro-color-supplied.png",
    cornerRadius: 8,
    showPoweredBy: true,
  });
});

test("color normalization and foreground selection preserve readable action controls", () => {
  assert.equal(normalizeHexColor(" #ABC "), "#aabbcc");
  assert.equal(normalizeHexColor("javascript:red"), null);
  for (const background of ["#145bb8", "#f4c542", "#080a0d", "#ffffff"]) {
    const foreground = accessibleForeground(background);
    assert.ok(contrastRatio(foreground, background) >= 4.5, `${background} should meet AA contrast`);
  }
});

test("brand resolution applies platform, organization, and workspace layers in order", () => {
  let revisions = migrateLegacyBrand(legacy, context);
  revisions = createBrandDraft(revisions, {
    context,
    scope: "workspace",
    values: { displayName: "Executive Review", primaryColor: "#14694e" },
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:10:00.000Z",
  });
  const draft = revisions[revisions.length - 1];
  const preview = resolveBrand(revisions, context, draft.id);
  assert.equal(preview.values.displayName, "Executive Review");
  assert.equal(preview.values.primaryColor, "#14694e");
  assert.equal(preview.values.playerLabel, legacy.playerLabel);

  revisions = publishBrandRevision(revisions, {
    revisionId: draft.id,
    organizationId: context.organizationId,
    publishedAt: "2026-07-15T03:11:00.000Z",
  });
  const published = resolveBrand(revisions, context);
  assert.equal(published.values.displayName, "Executive Review");
  assert.equal(published.provenance.displayName, draft.id);
});

test("organization draft preview exactly matches publication beneath workspace overrides", () => {
  let revisions = migrateLegacyBrand(legacy, context);
  revisions = createBrandDraft(revisions, {
    context,
    scope: "workspace",
    values: { displayName: "Workspace review", showPoweredBy: false },
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:11:30.000Z",
  });
  const workspaceRevision = revisions[revisions.length - 1];
  revisions = publishBrandRevision(revisions, {
    revisionId: workspaceRevision.id,
    organizationId: context.organizationId,
    publishedAt: "2026-07-15T03:11:40.000Z",
  });

  revisions = createBrandDraft(revisions, {
    context,
    scope: "organization",
    values: { displayName: "Content Co-op Studio", primaryColor: "#14694e" },
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:11:50.000Z",
  });
  const organizationDraft = revisions[revisions.length - 1];
  const preview = resolveBrand(revisions, context, organizationDraft.id);

  const publishedRevisions = publishBrandRevision(revisions, {
    revisionId: organizationDraft.id,
    organizationId: context.organizationId,
    publishedAt: "2026-07-15T03:12:00.000Z",
  });
  const published = resolveBrand(publishedRevisions, context);

  assert.deepEqual(preview, published);
  assert.equal(preview.values.displayName, "Workspace review");
  assert.equal(preview.provenance.displayName, workspaceRevision.id);
  assert.equal(preview.values.primaryColor, "#14694e");
  assert.equal(preview.provenance.primaryColor, organizationDraft.id);
  assert.equal(preview.values.playerLabel, PLATFORM_BRAND_VALUES.playerLabel);
});

test("brand resolution and publication reject cross-tenant layers", () => {
  let revisions = migrateLegacyBrand(legacy, context);
  revisions = createBrandDraft(revisions, {
    context: { organizationId: "org-other", workspaceId: "workspace-other" },
    scope: "organization",
    values: { displayName: "Other tenant", primaryColor: "#b64e4e" },
    createdBy: "user-other",
    createdAt: "2026-07-15T03:12:00.000Z",
  });
  const foreignDraft = revisions[revisions.length - 1];
  assert.equal(resolveBrand(revisions, context, foreignDraft.id).values.displayName, legacy.displayName);
  assert.throws(
    () =>
      publishBrandRevision(revisions, {
        revisionId: foreignDraft.id,
        organizationId: context.organizationId,
      }),
    /does not belong/i,
  );
});

test("publishing archives the previous layer and rollback creates a new draft", () => {
  let revisions = migrateLegacyBrand(legacy, context);
  revisions = createBrandDraft(revisions, {
    context,
    scope: "organization",
    values: { displayName: "Content Co-op Studio" },
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:13:00.000Z",
  });
  const draft = revisions[revisions.length - 1];
  revisions = publishBrandRevision(revisions, {
    revisionId: draft.id,
    organizationId: context.organizationId,
    publishedAt: "2026-07-15T03:14:00.000Z",
  });
  const original = revisions.find((revision) => revision.id === "brand-org-content-coop-v1");
  assert.equal(original?.status, "archived");
  assert.equal(revisions.find((revision) => revision.id === draft.id)?.status, "published");

  const rolledBack = createRollbackDraft(revisions, {
    sourceRevisionId: original?.id ?? "",
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:15:00.000Z",
  });
  const rollbackDraft = rolledBack[rolledBack.length - 1];
  assert.equal(rollbackDraft.status, "draft");
  assert.equal(rollbackDraft.version, 3);
  assert.deepEqual(rollbackDraft.values, original?.values);
});

test("drafts can be discarded without changing the published layer", () => {
  const revisions = createBrandDraft(migrateLegacyBrand(legacy, context), {
    context,
    scope: "organization",
    values: { displayName: "Temporary review brand" },
    createdBy: "user-bailey",
    createdAt: "2026-07-15T03:16:00.000Z",
  });
  const draft = revisions[revisions.length - 1];
  const discarded = discardBrandDraft(revisions, {
    revisionId: draft.id,
    organizationId: context.organizationId,
  });

  assert.equal(discarded.some((revision) => revision.id === draft.id), false);
  assert.equal(resolveBrand(discarded, context).values.displayName, legacy.displayName);
  assert.throws(
    () =>
      discardBrandDraft(revisions, {
        revisionId: draft.id,
        organizationId: "org-other",
      }),
    /does not belong/i,
  );
  assert.throws(
    () =>
      discardBrandDraft(revisions, {
        revisionId: "brand-org-content-coop-v1",
        organizationId: context.organizationId,
      }),
    /not found/i,
  );
});

test("stored brand history recovers from corruption and filters foreign tenants", () => {
  const fallback = migrateLegacyBrand(legacy, context);
  assert.equal(restoreBrandRevisions("not-json", fallback, context).recovered, true);

  const foreign = migrateLegacyBrand(legacy, {
    organizationId: "org-other",
    workspaceId: "workspace-other",
  })[1];
  const restored = restoreBrandRevisions(JSON.stringify([...fallback, foreign]), fallback, context);
  assert.equal(restored.recovered, false);
  assert.equal(restored.revisions.some((revision) => revision.organizationId === "org-other"), false);
});

test("draft validation rejects unsafe colors and unapproved logo paths", () => {
  const revisions = migrateLegacyBrand(legacy, context);
  assert.throws(
    () =>
      createBrandDraft(revisions, {
        context,
        scope: "workspace",
        values: { primaryColor: "url(javascript:alert(1))" },
        createdBy: "user-bailey",
      }),
    /hexadecimal/i,
  );
  assert.throws(
    () =>
      createBrandDraft(revisions, {
        context,
        scope: "workspace",
        values: { logoPath: "https://attacker.example/logo.svg" as never },
        createdBy: "user-bailey",
      }),
    /approved brand asset/i,
  );
});
