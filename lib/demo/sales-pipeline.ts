export const DEMO_SALES_TEAM_ID = "d1000000-0000-4000-8000-000000000001";

export interface SalesPipelineItem {
  team_id: string;
  cursor_id: string;
  inquiry_id: string;
  inquiry_submitted_at: string;
  opportunity_id: string | null;
  opportunity_name: string;
  stage: string;
  probability_basis_points: number | null;
  expected_close_date: string | null;
  owner_id: string | null;
  authority_version: number;
  account_id: string | null;
  account_name: string;
  primary_contact_id: string | null;
  contact_name: string;
  brief_revision_id: string | null;
  brief_revision_number: number | null;
  brief_status: string | null;
  brief_content_hash: string | null;
  proposal_request_receipt_id?: string | null;
  proposal_requested_at?: string | null;
  activation_status?: "awaiting_authorization" | "project_active" | null;
  activation_authorization_receipt_id?: string | null;
  activated_project_id?: string | null;
  updated_at: string;
}

export interface InquiryDetail {
  schemaVersion: "cco.crm.inquiry-detail.v2";
  inquiry: {
    id: string;
    teamId: string;
    authorityVersion: number;
    status: "received";
    submittedAt: string;
    contact: { name: string; email: string; phone: string | null };
    company: { name: string; website: string | null };
    project: {
      title: string;
      goals: string[];
      audiences: string[];
      requestedDeliverables: string[];
      references: string[];
      constraints: string[];
      notes: string | null;
    };
    timeline: {
      desiredStartDate: string | null;
      dueDate: string | null;
      flexibility: string;
    };
    budgetSignal: {
      source: "client_reported";
      authority: "non_authoritative";
      band: string;
    };
    attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      contentHash: string | null;
      state: string;
      scanVerdict: string | null;
      ordinal: number | null;
      boundAt: string | null;
    }>;
  };
}

export interface IntakeFormSummary {
  id: string;
  form_key?: string;
  opaque_key?: string;
  name: string;
  status: "active" | "disabled";
  success_message: string | null;
  authority_version: number;
  created_at: string;
  updated_at: string;
}

const pipelineSeed: Array<
  Omit<SalesPipelineItem, "team_id" | "cursor_id" | "authority_version">
> = [
  {
    inquiry_id: "d2000000-0000-4000-8000-000000000001",
    inquiry_submitted_at: "2026-07-16T12:18:00.000Z",
    opportunity_id: null,
    opportunity_name: "Schneider field leadership series",
    stage: "inquiry",
    probability_basis_points: null,
    expected_close_date: null,
    owner_id: null,
    account_id: null,
    account_name: "Schneider",
    primary_contact_id: null,
    contact_name: "Morgan Ellis",
    brief_revision_id: null,
    brief_revision_number: null,
    brief_status: null,
    brief_content_hash: null,
    proposal_request_receipt_id: null,
    proposal_requested_at: null,
    activation_status: null,
    activation_authorization_receipt_id: null,
    activated_project_id: null,
    updated_at: "2026-07-16T12:18:00.000Z",
  },
  {
    inquiry_id: "d2000000-0000-4000-8000-000000000002",
    inquiry_submitted_at: "2026-07-15T19:40:00.000Z",
    opportunity_id: "d3000000-0000-4000-8000-000000000002",
    opportunity_name: "ICA roadshow executive film",
    stage: "discovery",
    probability_basis_points: 6500,
    expected_close_date: "2026-08-08",
    owner_id: "d4000000-0000-4000-8000-000000000001",
    account_id: "d5000000-0000-4000-8000-000000000002",
    account_name: "ICA",
    primary_contact_id: "d6000000-0000-4000-8000-000000000002",
    contact_name: "Jamie Mercer",
    brief_revision_id: "d7000000-0000-4000-8000-000000000002",
    brief_revision_number: 2,
    brief_status: "draft",
    brief_content_hash: `sha256:${"2".repeat(64)}`,
    proposal_request_receipt_id: null,
    proposal_requested_at: null,
    activation_status: null,
    activation_authorization_receipt_id: null,
    activated_project_id: null,
    updated_at: "2026-07-16T11:10:00.000Z",
  },
  {
    inquiry_id: "d2000000-0000-4000-8000-000000000003",
    inquiry_submitted_at: "2026-07-12T14:12:00.000Z",
    opportunity_id: "d3000000-0000-4000-8000-000000000003",
    opportunity_name: "McLaren podcast launch package",
    stage: "proposal_sent",
    probability_basis_points: 8000,
    expected_close_date: "2026-07-24",
    owner_id: "d4000000-0000-4000-8000-000000000001",
    account_id: "d5000000-0000-4000-8000-000000000003",
    account_name: "McLaren",
    primary_contact_id: "d6000000-0000-4000-8000-000000000003",
    contact_name: "Taylor Brooks",
    brief_revision_id: "d7000000-0000-4000-8000-000000000003",
    brief_revision_number: 3,
    brief_status: "ready_for_proposal",
    brief_content_hash: `sha256:${"3".repeat(64)}`,
    proposal_request_receipt_id: "d8000000-0000-4000-8000-000000000003",
    proposal_requested_at: "2026-07-15T20:15:00.000Z",
    activation_status: "awaiting_authorization",
    activation_authorization_receipt_id: null,
    activated_project_id: null,
    updated_at: "2026-07-16T09:32:00.000Z",
  },
  {
    inquiry_id: "d2000000-0000-4000-8000-000000000004",
    inquiry_submitted_at: "2026-07-08T16:30:00.000Z",
    opportunity_id: "d3000000-0000-4000-8000-000000000004",
    opportunity_name: "BP Permian safety stories",
    stage: "won",
    probability_basis_points: 10000,
    expected_close_date: "2026-07-14",
    owner_id: "d4000000-0000-4000-8000-000000000001",
    account_id: "d5000000-0000-4000-8000-000000000004",
    account_name: "BP",
    primary_contact_id: "d6000000-0000-4000-8000-000000000004",
    contact_name: "Riley Chen",
    brief_revision_id: "d7000000-0000-4000-8000-000000000004",
    brief_revision_number: 4,
    brief_status: "ready_for_proposal",
    brief_content_hash: `sha256:${"4".repeat(64)}`,
    proposal_request_receipt_id: "d8000000-0000-4000-8000-000000000004",
    proposal_requested_at: "2026-07-09T18:30:00.000Z",
    activation_status: "project_active",
    activation_authorization_receipt_id: "da000000-0000-4000-8000-000000000004",
    activated_project_id: "bp",
    updated_at: "2026-07-15T21:05:00.000Z",
  },
];

export const DEMO_SALES_PIPELINE: SalesPipelineItem[] = pipelineSeed.map(
  (item, index) => ({
    ...item,
    team_id: DEMO_SALES_TEAM_ID,
    cursor_id: `d9000000-0000-4000-8000-00000000000${index + 1}`,
    authority_version:
      item.stage === "proposal_sent" ? 2 : item.stage === "won" ? 3 : 1,
  }),
);

function detail(
  item: SalesPipelineItem,
  overrides: Partial<InquiryDetail["inquiry"]["project"]> = {},
): InquiryDetail {
  return {
    schemaVersion: "cco.crm.inquiry-detail.v2",
    inquiry: {
      id: item.inquiry_id,
      teamId: item.team_id,
      authorityVersion: item.authority_version,
      status: "received",
      submittedAt: item.inquiry_submitted_at,
      contact: {
        name: item.contact_name,
        email: `${item.contact_name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        phone: "+19155550136",
      },
      company: {
        name: item.account_name,
        website: `https://${item.account_name.toLowerCase().replaceAll(" ", "")}.example.com`,
      },
      project: {
        title: item.opportunity_name,
        goals: ["Build a credible human story", "Create reusable campaign footage"],
        audiences: ["Customers", "Internal leadership"],
        requestedDeliverables: ["90-second hero film", "Three social cutdowns"],
        references: ["https://www.contentco-op.com/"],
        constraints: ["Protect confidential locations", "Client review before final mix"],
        notes: "Primary interviews and supporting field footage are expected.",
        ...overrides,
      },
      timeline: {
        desiredStartDate: "2026-08-03",
        dueDate:
          item.stage === "inquiry"
            ? "2026-09-04"
            : item.stage === "discovery"
              ? "2026-09-18"
              : item.stage === "proposal_sent"
                ? "2026-08-28"
                : "2026-08-14",
        flexibility: "somewhat_flexible",
      },
      budgetSignal: {
        source: "client_reported",
        authority: "non_authoritative",
        band: item.stage === "inquiry" ? "25k_50k" : "50k_100k",
      },
      attachments: item.stage === "inquiry"
        ? [
            {
              id: "db000000-0000-4000-8000-000000000001",
              filename: "schneider-field-story-reference.mp4",
              mimeType: "video/mp4",
              sizeBytes: 48_761_332,
              contentHash: `sha256:${"1".repeat(64)}`,
              state: "bound",
              scanVerdict: "clean",
              ordinal: 1,
              boundAt: item.inquiry_submitted_at,
            },
            {
              id: "db000000-0000-4000-8000-000000000002",
              filename: "site-access-notes.pdf",
              mimeType: "application/pdf",
              sizeBytes: 824_115,
              contentHash: `sha256:${"2".repeat(64)}`,
              state: "bound",
              scanVerdict: "pending",
              ordinal: 2,
              boundAt: item.inquiry_submitted_at,
            },
          ]
        : [],
    },
  };
}

export const DEMO_INQUIRY_DETAILS = Object.fromEntries(
  DEMO_SALES_PIPELINE.map((item) => [item.inquiry_id, detail(item)]),
) as Record<string, InquiryDetail>;

export const DEMO_INTAKE_FORMS: IntakeFormSummary[] = [
  {
    id: "da000000-0000-4000-8000-000000000001",
    form_key: `ifm_${"a".repeat(64)}`,
    name: "New production inquiry",
    status: "active",
    success_message: "Your production inquiry is in. Our team will follow up shortly.",
    authority_version: 1,
    created_at: "2026-07-08T15:00:00.000Z",
    updated_at: "2026-07-08T15:00:00.000Z",
  },
  {
    id: "da000000-0000-4000-8000-000000000002",
    form_key: `ifm_${"b".repeat(64)}`,
    name: "Existing client project request",
    status: "active",
    success_message: "We received your request and attached it to the intake queue.",
    authority_version: 1,
    created_at: "2026-07-10T17:20:00.000Z",
    updated_at: "2026-07-10T17:20:00.000Z",
  },
];

export function demoProposalContext(item: SalesPipelineItem) {
  const inquiry = DEMO_INQUIRY_DETAILS[item.inquiry_id].inquiry;
  if (
    !item.proposal_request_receipt_id ||
    !item.proposal_requested_at ||
    !item.opportunity_id ||
    !item.account_id ||
    !item.primary_contact_id ||
    !item.brief_revision_id ||
    !item.brief_revision_number ||
    !item.brief_content_hash ||
    (item.stage !== "proposal_requested" && item.stage !== "proposal_sent") ||
    item.brief_status !== "ready_for_proposal"
  ) {
    throw new Error("Demo proposal context is not ready");
  }
  return {
    schemaVersion: "cco.crm.proposal-context.v3",
    commercialAuthority: "proposal-studio",
    pricingIncluded: false,
    handoffOrigin: {
      authority: "co-videopro-crm",
      inquiryId: item.inquiry_id,
      accountId: item.account_id,
      accountAuthorityVersion: 1,
      primaryContactId: item.primary_contact_id,
      contactAuthorityVersion: 1,
      opportunityId: item.opportunity_id,
      opportunityAuthorityVersion: item.authority_version,
      briefRevisionId: item.brief_revision_id,
      briefRevisionNumber: item.brief_revision_number,
      briefContentHash: item.brief_content_hash,
    },
    proposalStudioImport: {
      schemaVersion: "cco.proposal-studio.import-context.v3",
      commercialAuthority: "proposal-studio",
      pricingIncluded: false,
      source: "co-videopro-crm",
      opportunity: {
        id: item.opportunity_id,
        name: item.opportunity_name,
        authorityVersion: item.authority_version,
        stage: item.stage,
      },
      client: {
        id: item.account_id,
        displayName: item.account_name,
        authorityVersion: 1,
      },
      contact: {
        id: item.primary_contact_id,
        authorityVersion: 1,
      },
      brief: {
        id: item.brief_revision_id,
        revisionNumber: item.brief_revision_number,
        contentHash: item.brief_content_hash,
        status: item.brief_status,
        title: item.opportunity_name,
        requestedDeliverables: inquiry.project.requestedDeliverables,
        constraints: inquiry.project.constraints,
      },
      readiness: {
        receiptId: item.proposal_request_receipt_id,
        requestedAt: item.proposal_requested_at,
      },
      requestedProductionWindow: {
        source: "client_reported",
        authority: "non_authoritative",
        desiredStartDate: inquiry.timeline.desiredStartDate,
        dueDate: inquiry.timeline.dueDate,
        flexibility: inquiry.timeline.flexibility,
      },
    },
    readiness: {
      receiptId: item.proposal_request_receipt_id,
      requestedAt: item.proposal_requested_at,
    },
    opportunity: {
      id: item.opportunity_id,
      stage: item.stage,
      name: item.opportunity_name,
      probabilityBasisPoints: item.probability_basis_points,
      expectedCloseDate: item.expected_close_date,
    },
    client: {
      id: item.account_id,
      displayName: item.account_name,
      website: inquiry.company.website,
    },
    contact: {
      id: item.primary_contact_id,
      name: item.contact_name,
      email: inquiry.contact.email,
      phone: inquiry.contact.phone,
    },
    brief: {
      id: item.brief_revision_id,
      revisionNumber: item.brief_revision_number,
      status: item.brief_status,
      title: item.opportunity_name,
      objectives: inquiry.project.goals,
      audiences: inquiry.project.audiences,
      keyMessages: ["Human expertise drives dependable outcomes"],
      requestedDeliverables: inquiry.project.requestedDeliverables,
      constraints: inquiry.project.constraints,
      references: inquiry.project.references,
      successCriteria: ["Approved master and platform-ready derivatives"],
    },
    discovery: {
      submittedAt: inquiry.submittedAt,
      notes: inquiry.project.notes,
      timeline: inquiry.timeline,
      budgetSignal: inquiry.budgetSignal,
    },
  };
}
