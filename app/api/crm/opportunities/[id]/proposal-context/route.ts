import { NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import {
  CRM_MUTATION_MAX_BYTES,
  normalizeCrmUuid,
  parseOpportunityProposalRequestMutation,
  parseOpportunityProposalRequestReceipt,
  PreProjectValidationError,
} from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { createProposalStudioImportContext } from "@/lib/proposals/proposal-studio-contract";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const READY_CONTEXT_COLUMNS = [
  "team_id",
  "opportunity_id",
  "opportunity_name",
  "opportunity_stage",
  "probability_basis_points",
  "expected_close_date",
  "opportunity_authority_version",
  "opportunity_updated_at",
  "account_id",
  "account_display_name",
  "account_legal_name",
  "account_website",
  "account_lifecycle_status",
  "account_authority_version",
  "contact_id",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_phone",
  "contact_stakeholder_role",
  "contact_authority_version",
  "brief_revision_id",
  "brief_revision_number",
  "brief_status",
  "brief_title",
  "brief_objectives",
  "brief_audiences",
  "brief_key_messages",
  "brief_requested_deliverables",
  "brief_constraints",
  "brief_references",
  "brief_success_criteria",
  "brief_content_hash",
  "brief_created_at",
  "inquiry_id",
  "inquiry_submitted_at",
  "inquiry_project_title",
  "inquiry_goals",
  "inquiry_audiences",
  "inquiry_requested_deliverables",
  "inquiry_reference_urls",
  "inquiry_constraints",
  "inquiry_notes",
  "inquiry_desired_start_date",
  "inquiry_due_date",
  "inquiry_timeline_flexibility",
  "inquiry_budget_band",
  "proposal_request_receipt_id",
  "proposal_requested_at",
].join(", ");

interface ProposalReadyContextRow {
  team_id: string;
  opportunity_id: string;
  opportunity_name: string;
  opportunity_stage: "proposal_requested" | "proposal_sent";
  probability_basis_points: number;
  expected_close_date: string | null;
  opportunity_authority_version: number;
  opportunity_updated_at: string;
  account_id: string;
  account_display_name: string;
  account_legal_name: string | null;
  account_website: string | null;
  account_lifecycle_status: string;
  account_authority_version: number;
  contact_id: string;
  contact_name: string;
  contact_title: string | null;
  contact_email: string;
  contact_phone: string | null;
  contact_stakeholder_role: string;
  contact_authority_version: number;
  brief_revision_id: string;
  brief_revision_number: number;
  brief_status: "ready_for_proposal";
  brief_title: string;
  brief_objectives: string[];
  brief_audiences: string[];
  brief_key_messages: string[];
  brief_requested_deliverables: string[];
  brief_constraints: string[];
  brief_references: string[];
  brief_success_criteria: string[];
  brief_content_hash: `sha256:${string}`;
  brief_created_at: string;
  inquiry_id: string;
  inquiry_submitted_at: string;
  inquiry_project_title: string;
  inquiry_goals: string[];
  inquiry_audiences: string[];
  inquiry_requested_deliverables: string[];
  inquiry_reference_urls: string[];
  inquiry_constraints: string[];
  inquiry_notes: string | null;
  inquiry_desired_start_date: string | null;
  inquiry_due_date: string | null;
  inquiry_timeline_flexibility:
    | "fixed"
    | "somewhat_flexible"
    | "flexible"
    | "unknown";
  inquiry_budget_band: string;
  proposal_request_receipt_id: string;
  proposal_requested_at: string;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function proposalRequestDatabaseError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("crm_proposal_idempotency_conflict")) {
    return json(
      { error: "This request ID is already bound to different proposal content" },
      409,
    );
  }
  if (
    message.includes("crm_proposal_version_conflict") ||
    message.includes("crm_proposal_brief_conflict")
  ) {
    return json(
      { error: "The opportunity changed elsewhere. Reload before requesting a proposal." },
      409,
    );
  }
  if (message.includes("crm_proposal_invalid_transition")) {
    return json(
      { error: "A proposal cannot be requested from the opportunity's current stage." },
      409,
    );
  }
  if (message.includes("crm_proposal_not_found")) {
    return json({ error: "Opportunity not found" }, 404);
  }
  if (message.includes("crm_proposal_forbidden")) {
    return json({ error: "Forbidden" }, 403);
  }
  if (message.includes("invalid_crm_proposal_request")) {
    return json({ error: "Proposal request is invalid" }, 400);
  }
  return json({ error: "Proposal readiness authority is temporarily unavailable" }, 503);
}

async function opportunityIdFrom(
  params: Promise<{ id: string }>,
): Promise<string | null> {
  try {
    return normalizeCrmUuid((await params).id, "opportunity_id");
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "Proposal readiness authority is temporarily unavailable" }, 503);
  }

  const opportunityId = await opportunityIdFrom(params);
  if (!opportunityId) return json({ error: "Opportunity not found" }, 404);
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return json({ error: "Request must use application/json" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > CRM_MUTATION_MAX_BYTES) {
    return json({ error: "Proposal request is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > CRM_MUTATION_MAX_BYTES) {
    return json({ error: "Proposal request is too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }

  let mutation;
  try {
    mutation = parseOpportunityProposalRequestMutation(body);
  } catch (error) {
    if (error instanceof PreProjectValidationError) {
      return json(
        {
          error: error.message,
          code: error.code,
          ...(error.field ? { field: error.field } : {}),
        },
        400,
      );
    }
    return json({ error: "Proposal request is invalid" }, 400);
  }

  const { data, error } = await supabase.rpc("request_opportunity_proposal", {
    p_opportunity_id: opportunityId,
    p_expected_version: mutation.expectedVersion,
    p_request_id: mutation.requestId,
    p_source_brief_revision_id: mutation.sourceBriefRevisionId,
    p_source_brief_content_hash: mutation.sourceBriefContentHash,
  });
  if (error) return proposalRequestDatabaseError(error);
  const receipt = parseOpportunityProposalRequestReceipt(data);
  if (!receipt) {
    return json({ error: "Proposal request returned no durable receipt" }, 503);
  }
  return json(receipt, receipt.replayed ? 200 : 201);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "CRM authority is temporarily unavailable" }, 503);
  }

  const opportunityId = await opportunityIdFrom(params);
  if (!opportunityId) return json({ error: "Opportunity not found" }, 404);

  const contextResult = await supabase
    .from("proposal_studio_ready_context")
    .select(READY_CONTEXT_COLUMNS)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (contextResult.error) {
    return json({ error: "Proposal context is temporarily unavailable" }, 503);
  }
  const context = contextResult.data as unknown as ProposalReadyContextRow | null;
  if (!context) {
    const diagnostic = await supabase
      .from("opportunities")
      .select("id")
      .eq("id", opportunityId)
      .maybeSingle();
    if (diagnostic.error) {
      return json({ error: "Proposal context is temporarily unavailable" }, 503);
    }
    if (!diagnostic.data) return json({ error: "Opportunity not found" }, 404);
    return json(
      {
        error: "Request a proposal before loading Proposal Studio context.",
        code: "PROPOSAL_NOT_REQUESTED",
      },
      409,
    );
  }

  const handoffOrigin = {
    authority: "co-videopro-crm" as const,
    inquiryId: context.inquiry_id,
    accountId: context.account_id,
    accountAuthorityVersion: context.account_authority_version,
    primaryContactId: context.contact_id,
    contactAuthorityVersion: context.contact_authority_version,
    opportunityId: context.opportunity_id,
    opportunityAuthorityVersion: context.opportunity_authority_version,
    briefRevisionId: context.brief_revision_id,
    briefRevisionNumber: context.brief_revision_number,
    briefContentHash: context.brief_content_hash,
  };

  let proposalStudioImport;
  try {
    proposalStudioImport = createProposalStudioImportContext({
      origin: handoffOrigin,
      opportunity: {
        id: context.opportunity_id,
        name: context.opportunity_name,
        authorityVersion: context.opportunity_authority_version,
        stage: context.opportunity_stage,
      },
      client: {
        id: context.account_id,
        displayName: context.account_display_name,
        authorityVersion: context.account_authority_version,
      },
      contact: {
        id: context.contact_id,
        authorityVersion: context.contact_authority_version,
      },
      brief: {
        id: context.brief_revision_id,
        revisionNumber: context.brief_revision_number,
        contentHash: context.brief_content_hash,
        status: context.brief_status,
        title: context.brief_title,
        requestedDeliverables: context.brief_requested_deliverables,
        constraints: context.brief_constraints,
      },
      readiness: {
        receiptId: context.proposal_request_receipt_id,
        requestedAt: context.proposal_requested_at,
      },
      requestedProductionWindow: {
        desiredStartDate: context.inquiry_desired_start_date,
        dueDate: context.inquiry_due_date,
        flexibility: context.inquiry_timeline_flexibility,
      },
    });
  } catch {
    return json({ error: "Opportunity source context is incomplete" }, 409);
  }

  return json({
    schemaVersion: "cco.crm.proposal-context.v3",
    commercialAuthority: "proposal-studio",
    pricingIncluded: false,
    handoffOrigin,
    proposalStudioImport,
    readiness: {
      receiptId: context.proposal_request_receipt_id,
      requestedAt: context.proposal_requested_at,
    },
    opportunity: {
      id: context.opportunity_id,
      version: context.opportunity_authority_version,
      stage: context.opportunity_stage,
      name: context.opportunity_name,
      probabilityBasisPoints: context.probability_basis_points,
      expectedCloseDate: context.expected_close_date,
      sourceInquiryId: context.inquiry_id,
      updatedAt: context.opportunity_updated_at,
    },
    client: {
      id: context.account_id,
      version: context.account_authority_version,
      displayName: context.account_display_name,
      legalName: context.account_legal_name,
      website: context.account_website,
      lifecycleStatus: context.account_lifecycle_status,
    },
    contact: {
      id: context.contact_id,
      version: context.contact_authority_version,
      name: context.contact_name,
      title: context.contact_title,
      email: context.contact_email,
      phone: context.contact_phone,
      stakeholderRole: context.contact_stakeholder_role,
    },
    brief: {
      id: context.brief_revision_id,
      revisionNumber: context.brief_revision_number,
      status: context.brief_status,
      title: context.brief_title,
      objectives: context.brief_objectives,
      audiences: context.brief_audiences,
      keyMessages: context.brief_key_messages,
      requestedDeliverables: context.brief_requested_deliverables,
      constraints: context.brief_constraints,
      references: context.brief_references,
      successCriteria: context.brief_success_criteria,
      contentHash: context.brief_content_hash,
      createdAt: context.brief_created_at,
    },
    discovery: {
      sourceInquiryId: context.inquiry_id,
      submittedAt: context.inquiry_submitted_at,
      projectTitle: context.inquiry_project_title,
      goals: context.inquiry_goals,
      audiences: context.inquiry_audiences,
      requestedDeliverables: context.inquiry_requested_deliverables,
      references: context.inquiry_reference_urls,
      constraints: context.inquiry_constraints,
      notes: context.inquiry_notes,
      timeline: {
        desiredStartDate: context.inquiry_desired_start_date,
        dueDate: context.inquiry_due_date,
        flexibility: context.inquiry_timeline_flexibility,
      },
      budgetSignal: {
        source: "client_reported",
        authority: "non_authoritative",
        band: context.inquiry_budget_band,
      },
    },
  });
}
