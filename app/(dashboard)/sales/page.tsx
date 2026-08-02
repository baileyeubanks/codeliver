"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileInput,
  Filter,
  Handshake,
  Inbox,
  Link2,
  LoaderCircle,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useIdentityContext } from "@/components/auth/useIdentityContext";
import useAuthHostContext from "@/components/auth/useAuthHostContext";
import { roleCan } from "@/components/navigation/navigation-model";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import { useDemoMode } from "@/lib/demo/mode";
import {
  DEMO_INQUIRY_DETAILS,
  DEMO_INTAKE_FORMS,
  DEMO_SALES_PIPELINE,
  DEMO_SALES_TEAM_ID,
  demoProposalContext,
  type InquiryDetail,
  type IntakeFormSummary,
  type SalesPipelineItem,
} from "@/lib/demo/sales-pipeline";
import styles from "./SalesPage.module.css";

type PipelineFilter = "all" | "inquiry" | "active" | "proposal" | "won";
type DrawerMode = "lead" | "forms" | null;

interface ProposalContext {
  schemaVersion?: string;
  commercialAuthority?: string;
  pricingIncluded?: boolean;
  handoffOrigin?: Record<string, unknown>;
  proposalStudioImport?: {
    schemaVersion?: string;
    requestedProductionWindow?: {
      source?: "client_reported";
      authority?: "non_authoritative";
      desiredStartDate?: string | null;
      dueDate?: string | null;
      flexibility?: "fixed" | "somewhat_flexible" | "flexible" | "unknown";
    };
  };
  opportunity?: {
    id?: string | null;
    stage?: string;
    name?: string;
    probabilityBasisPoints?: number | null;
    expectedCloseDate?: string | null;
  };
  client?: { displayName?: string; website?: string | null };
  contact?: { name?: string; email?: string; phone?: string | null };
  brief?: {
    revisionNumber?: number | null;
    status?: string | null;
    title?: string;
    objectives?: string[];
    audiences?: string[];
    keyMessages?: string[];
    requestedDeliverables?: string[];
    constraints?: string[];
    references?: string[];
    successCriteria?: string[];
  };
  discovery?: {
    submittedAt?: string;
    notes?: string | null;
    timeline?: {
      desiredStartDate?: string | null;
      dueDate?: string | null;
      flexibility?: string;
    };
    budgetSignal?: { band?: string };
  };
}

interface QualificationDraft {
  companyName: string;
  companyWebsite: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
  opportunityName: string;
  probabilityPercent: string;
  expectedCloseDate: string;
  briefTitle: string;
  objectives: string;
  audiences: string;
  keyMessages: string;
  deliverables: string;
  constraints: string;
  references: string;
  successCriteria: string;
}

const ACTIVE_STAGES = new Set([
  "qualification",
  "discovery",
  "briefing",
  "proposal_requested",
]);
const PROPOSAL_REQUESTABLE_STAGES = new Set([
  "qualification",
  "discovery",
  "briefing",
]);
const PROPOSAL_CONTEXT_STAGES = new Set(["proposal_requested", "proposal_sent"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listFrom(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    inquiry: "New inquiry",
    qualification: "Qualification",
    discovery: "Discovery",
    briefing: "Briefing",
    proposal_requested: "Proposal requested",
    proposal_sent: "Proposal sent",
    won: "Won",
    lost: "Lost",
    on_hold: "On hold",
  };
  return labels[stage] ?? titleCase(stage);
}

function activationSummary(item: SalesPipelineItem) {
  if (
    item.activation_status === "project_active" &&
    item.activation_authorization_receipt_id &&
    item.activated_project_id
  ) {
    return {
      state: "active" as const,
      label: "Project active",
      detail: "Proposal Studio authorization is recorded.",
      projectId: item.activated_project_id,
    };
  }
  if (item.stage === "won") {
    return {
      state: "missing" as const,
      label: "Activation evidence unavailable",
      detail: "This record cannot prove the production authorization receipt.",
      projectId: null,
    };
  }
  if (
    item.activation_status === "awaiting_authorization" ||
    item.stage === "proposal_requested" ||
    item.stage === "proposal_sent"
  ) {
    return {
      state: "awaiting" as const,
      label: "Awaiting production authorization",
      detail: "Proposal Studio must clear every required policy gate.",
      projectId: null,
    };
  }
  return null;
}

function shortDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function probabilityLabel(value: number | null) {
  return value === null ? "Unscored" : `${Math.round(value / 100)}%`;
}

function budgetLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    unknown: "Not supplied",
    under_10k: "Under $10K",
    "10k_25k": "$10K-$25K",
    "25k_50k": "$25K-$50K",
    "50k_100k": "$50K-$100K",
    over_100k: "$100K+",
  };
  return value ? labels[value] ?? titleCase(value) : "Not supplied";
}

function fileSize(value: number) {
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(1)} GB`;
}

function scanLabel(value: string | null) {
  if (value === "clean") return "Screened";
  if (value === "infected") return "Blocked";
  if (value === "error") return "Needs review";
  return "Quarantined";
}

function emptyDraft(detail: InquiryDetail): QualificationDraft {
  const inquiry = detail.inquiry;
  return {
    companyName: inquiry.company.name,
    companyWebsite: inquiry.company.website ?? "",
    contactName: inquiry.contact.name,
    contactEmail: inquiry.contact.email,
    contactPhone: inquiry.contact.phone ?? "",
    contactTitle: "",
    opportunityName: inquiry.project.title,
    probabilityPercent: "50",
    expectedCloseDate: "",
    briefTitle: inquiry.project.title,
    objectives: inquiry.project.goals.join("\n"),
    audiences: inquiry.project.audiences.join("\n"),
    keyMessages: "",
    deliverables: inquiry.project.requestedDeliverables.join("\n"),
    constraints: inquiry.project.constraints.join("\n"),
    references: inquiry.project.references.join("\n"),
    successCriteria: "",
  };
}

function readError(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

export default function SalesPage() {
  const demoMode = useDemoMode();
  const hostContext = useAuthHostContext();
  const authSession = useAuthSession(!demoMode);
  const staffSession = demoMode || (
    hostContext.kind !== "client" && authSession.session?.surfaceRole === "staff"
  );
  const identity = useIdentityContext(!demoMode && staffSession);
  const role = demoMode ? "owner" : identity.role;
  const teamId = demoMode ? DEMO_SALES_TEAM_ID : identity.context?.activeTeamId ?? null;
  const authorized = demoMode || (staffSession && roleCan(role, "sales:read"));
  const canQualify = demoMode || (staffSession && roleCan(role, "sales:qualify"));

  const [items, setItems] = useState<SalesPipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [proposal, setProposal] = useState<ProposalContext | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalRequestLoading, setProposalRequestLoading] = useState(false);
  const [editingQualification, setEditingQualification] = useState(false);
  const [qualification, setQualification] = useState<QualificationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerNotice, setDrawerNotice] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [forms, setForms] = useState<IntakeFormSummary[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState("");
  const [creatingForm, setCreatingForm] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [newFormMessage, setNewFormMessage] = useState("");
  const [copied, setCopied] = useState("");
  const proposalRequestRef = useRef<{
    fingerprint: string;
    requestId: string;
  } | null>(null);

  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(Boolean(drawerMode), drawerRef, () => setDrawerMode(null), closeRef);

  const selected = useMemo(
    () => items.find((item) => item.inquiry_id === selectedInquiryId) ?? null,
    [items, selectedInquiryId],
  );

  const loadPipeline = useCallback(async () => {
    if (!authorized || !teamId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (demoMode) {
      setItems((current) => current.length > 0 ? current : DEMO_SALES_PIPELINE);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/crm/pipeline?team_id=${encodeURIComponent(teamId)}&limit=100`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.items)) {
        throw new Error(readError(payload, "Sales pipeline could not be loaded"));
      }
      setItems(payload.items as SalesPipelineItem[]);
    } catch (caught) {
      setItems([]);
      setError(caught instanceof Error ? caught.message : "Sales pipeline could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [authorized, demoMode, teamId]);

  useEffect(() => {
    if (!demoMode && (authSession.loading || identity.loading)) return;
    void loadPipeline();
  }, [authSession.loading, demoMode, identity.loading, loadPipeline]);

  useEffect(() => {
    if (drawerMode !== "lead" || !selectedInquiryId || !teamId) return;
    setProposal(null);
    setEditingQualification(false);
    setQualification(null);
    setDrawerNotice("");
    setDrawerError("");
    setDetailError("");

    if (demoMode) {
      setDetail(DEMO_INQUIRY_DETAILS[selectedInquiryId] ?? null);
      return;
    }

    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    void fetch(
      `/api/crm/inquiries/${encodeURIComponent(selectedInquiryId)}?team_id=${encodeURIComponent(teamId)}`,
      { cache: "no-store", credentials: "same-origin", signal: controller.signal },
    )
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isRecord(payload) || !isRecord(payload.inquiry)) {
          throw new Error(readError(payload, "Inquiry details could not be loaded"));
        }
        setDetail(payload as unknown as InquiryDetail);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setDetailError(caught instanceof Error ? caught.message : "Inquiry details could not be loaded");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [demoMode, drawerMode, selectedInquiryId, teamId]);

  const metrics = useMemo(() => ({
    inquiries: items.filter((item) => !item.opportunity_id).length,
    active: items.filter((item) => ACTIVE_STAGES.has(item.stage)).length,
    proposals: items.filter((item) => item.stage === "proposal_sent").length,
    won: items.filter((item) => item.stage === "won").length,
  }), [items]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const stageMatch =
        filter === "all" ||
        (filter === "inquiry" && !item.opportunity_id) ||
        (filter === "active" && ACTIVE_STAGES.has(item.stage)) ||
        (filter === "proposal" && item.stage === "proposal_sent") ||
        (filter === "won" && item.stage === "won");
      if (!stageMatch) return false;
      if (!term) return true;
      return `${item.opportunity_name} ${item.account_name} ${item.contact_name} ${item.stage}`
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [filter, items, query]);

  function openLead(item: SalesPipelineItem) {
    setSelectedInquiryId(item.inquiry_id);
    setDrawerMode("lead");
  }

  function beginQualification() {
    if (!detail) return;
    setQualification(emptyDraft(detail));
    setEditingQualification(true);
    setDrawerNotice("");
    setDrawerError("");
  }

  function updateDraft(field: keyof QualificationDraft, value: string) {
    setQualification((current) => current ? { ...current, [field]: value } : current);
  }

  async function submitQualification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !detail || !qualification || !canQualify) return;
    const objectives = listFrom(qualification.objectives);
    if (objectives.length === 0) {
      setDrawerError("Add at least one objective before qualifying this inquiry.");
      return;
    }
    const probability = Math.max(0, Math.min(100, Number(qualification.probabilityPercent)));
    const body = {
      expectedVersion: detail.inquiry.authorityVersion,
      requestId: crypto.randomUUID(),
      account: {
        displayName: qualification.companyName.trim(),
        legalName: null,
        website: qualification.companyWebsite.trim() || null,
      },
      contact: {
        name: qualification.contactName.trim(),
        email: qualification.contactEmail.trim(),
        phone: qualification.contactPhone.trim() || null,
        title: qualification.contactTitle.trim() || null,
      },
      opportunity: {
        name: qualification.opportunityName.trim(),
        ownerId: null,
        probabilityBasisPoints: Math.round((Number.isFinite(probability) ? probability : 0) * 100),
        expectedCloseDate: qualification.expectedCloseDate || null,
      },
      brief: {
        title: qualification.briefTitle.trim(),
        objectives,
        audiences: listFrom(qualification.audiences),
        keyMessages: listFrom(qualification.keyMessages),
        requestedDeliverables: listFrom(qualification.deliverables),
        constraints: listFrom(qualification.constraints),
        references: listFrom(qualification.references),
        successCriteria: listFrom(qualification.successCriteria),
      },
    };

    setSaving(true);
    setDrawerNotice("");
    setDrawerError("");
    try {
      if (demoMode) {
        setItems((current) => current.map((item) => item.inquiry_id === selected.inquiry_id
          ? {
              ...item,
              opportunity_id: crypto.randomUUID(),
              account_id: crypto.randomUUID(),
              primary_contact_id: crypto.randomUUID(),
              brief_revision_id: crypto.randomUUID(),
              brief_revision_number: 1,
              brief_status: "draft",
              stage: "qualification",
              probability_basis_points: body.opportunity.probabilityBasisPoints,
              expected_close_date: body.opportunity.expectedCloseDate,
              updated_at: new Date().toISOString(),
            }
          : item));
      } else {
        const response = await fetch(
          `/api/crm/inquiries/${encodeURIComponent(selected.inquiry_id)}/qualify`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(readError(payload, "Inquiry could not be qualified"));
        await loadPipeline();
      }
      setEditingQualification(false);
      setDrawerNotice("Inquiry qualified. The account, contact, opportunity, and first brief revision now share one origin record.");
    } catch (caught) {
      setDrawerError(caught instanceof Error ? caught.message : "Inquiry could not be qualified");
    } finally {
      setSaving(false);
    }
  }

  async function requestProposal() {
    if (
      !selected?.opportunity_id ||
      !selected.brief_revision_id ||
      !selected.brief_content_hash ||
      !canQualify ||
      !PROPOSAL_REQUESTABLE_STAGES.has(selected.stage) ||
      selected.brief_status !== "draft"
    ) {
      setDrawerError("This opportunity is not ready to request a proposal.");
      return;
    }

    const fingerprint = [
      selected.opportunity_id,
      selected.authority_version,
      selected.brief_revision_id,
      selected.brief_content_hash,
    ].join(":");
    if (proposalRequestRef.current?.fingerprint !== fingerprint) {
      proposalRequestRef.current = {
        fingerprint,
        requestId: crypto.randomUUID(),
      };
    }
    const body = {
      expectedVersion: selected.authority_version,
      requestId: proposalRequestRef.current.requestId,
      sourceBriefRevisionId: selected.brief_revision_id,
      sourceBriefContentHash: selected.brief_content_hash,
    };

    setProposalRequestLoading(true);
    setDrawerNotice("");
    setDrawerError("");
    try {
      if (demoMode) {
        const requestedAt = new Date().toISOString();
        const readyBriefRevisionId = crypto.randomUUID();
        const proposalRequestReceiptId = crypto.randomUUID();
        setItems((current) => current.map((item) =>
          item.inquiry_id === selected.inquiry_id
            ? {
                ...item,
                stage: "proposal_requested",
                authority_version: item.authority_version + 1,
                brief_revision_id: readyBriefRevisionId,
                brief_revision_number: (item.brief_revision_number ?? 0) + 1,
                brief_status: "ready_for_proposal",
                proposal_request_receipt_id: proposalRequestReceiptId,
                proposal_requested_at: requestedAt,
                updated_at: requestedAt,
              }
            : item,
        ));
      } else {
        const response = await fetch(
          `/api/crm/opportunities/${encodeURIComponent(selected.opportunity_id)}/proposal-context`,
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => ({}));
        if (
          !response.ok ||
          !isRecord(payload) ||
          payload.opportunityId !== selected.opportunity_id ||
          payload.stage !== "proposal_requested" ||
          typeof payload.readyBriefRevisionId !== "string" ||
          typeof payload.proposalRequestReceiptId !== "string"
        ) {
          throw new Error(readError(payload, "Proposal could not be requested"));
        }
        await loadPipeline();
      }
      proposalRequestRef.current = null;
      setProposal(null);
      setDrawerNotice(
        "Proposal requested. A new immutable brief revision is ready for Proposal Studio.",
      );
    } catch (caught) {
      setDrawerError(
        caught instanceof Error ? caught.message : "Proposal could not be requested",
      );
    } finally {
      setProposalRequestLoading(false);
    }
  }

  async function loadProposalContext() {
    if (!selected?.opportunity_id) return;
    setProposalLoading(true);
    setDrawerNotice("");
    setDrawerError("");
    try {
      if (demoMode) {
        setProposal(demoProposalContext(selected) as ProposalContext);
      } else {
        const response = await fetch(
          `/api/crm/opportunities/${encodeURIComponent(selected.opportunity_id)}/proposal-context`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isRecord(payload)) {
          throw new Error(readError(payload, "Proposal context could not be loaded"));
        }
        setProposal(payload as ProposalContext);
      }
    } catch (caught) {
      setDrawerError(caught instanceof Error ? caught.message : "Proposal context could not be loaded");
    } finally {
      setProposalLoading(false);
    }
  }

  const loadForms = useCallback(async () => {
    if (!teamId || !authorized) return;
    setFormsLoading(true);
    setFormsError("");
    try {
      if (demoMode) {
        setForms((current) => current.length > 0 ? current : DEMO_INTAKE_FORMS);
        return;
      }
      const response = await fetch(
        `/api/crm/intake-forms?team_id=${encodeURIComponent(teamId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.items)) {
        throw new Error(readError(payload, "Intake forms could not be loaded"));
      }
      setForms(payload.items as IntakeFormSummary[]);
    } catch (caught) {
      setFormsError(caught instanceof Error ? caught.message : "Intake forms could not be loaded");
    } finally {
      setFormsLoading(false);
    }
  }, [authorized, demoMode, teamId]);

  useEffect(() => {
    if (drawerMode === "forms") void loadForms();
  }, [drawerMode, loadForms]);

  async function createIntakeForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !newFormName.trim()) return;
    setCreatingForm(true);
    setFormsError("");
    try {
      if (demoMode) {
        const now = new Date().toISOString();
        setForms((current) => [{
          id: crypto.randomUUID(),
          form_key: `ifm_${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}`,
          name: newFormName.trim(),
          status: "active",
          success_message: newFormMessage.trim() || null,
          authority_version: 1,
          created_at: now,
          updated_at: now,
        }, ...current]);
      } else {
        const response = await fetch("/api/crm/intake-forms", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            teamId,
            name: newFormName.trim(),
            successMessage: newFormMessage.trim() || null,
            requestId: crypto.randomUUID(),
          }),
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isRecord(payload) || !isRecord(payload.form)) {
          throw new Error(readError(payload, "Intake form could not be created"));
        }
        const form = payload.form;
        setForms((current) => [{
          id: String(form.id),
          form_key: String(form.formKey),
          name: String(form.name),
          status: form.status === "disabled" ? "disabled" : "active",
          success_message: typeof form.successMessage === "string" ? form.successMessage : null,
          authority_version: Number(form.authorityVersion ?? 1),
          created_at: String(form.createdAt),
          updated_at: String(form.createdAt),
        }, ...current]);
      }
      setNewFormName("");
      setNewFormMessage("");
    } catch (caught) {
      setFormsError(caught instanceof Error ? caught.message : "Intake form could not be created");
    } finally {
      setCreatingForm(false);
    }
  }

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }

  async function copyInquiryLink(key: string, href: string) {
    await copyValue(key, new URL(href, window.location.origin).toString());
  }

  const waitingForAuthority = !demoMode && (authSession.loading || identity.loading);
  if (waitingForAuthority) {
    return <SalesState kind="loading" />;
  }
  if (!authorized || !teamId) {
    return <SalesState kind="unavailable" />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.composition}>
        <header className={styles.pageHeader}>
          <div>
            <span>Business development</span>
            <div>
              <h1>Sales & intake</h1>
              <p>Qualify new work without re-entering client or brief data.</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setDrawerMode("forms")}>
              <Link2 size={16} />
              <span>Intake forms</span>
            </button>
            <button type="button" className={styles.iconButton} onClick={() => void loadPipeline()} aria-label="Refresh sales pipeline" title="Refresh sales pipeline">
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        <section className={styles.metricStrip} aria-label="Pipeline summary">
          <div><Inbox size={18} /><span><small>Needs qualification</small><strong>{metrics.inquiries}</strong></span></div>
          <div><Handshake size={18} /><span><small>Active opportunities</small><strong>{metrics.active}</strong></span></div>
          <div><FileInput size={18} /><span><small>Proposals out</small><strong>{metrics.proposals}</strong></span></div>
          <div><Check size={18} /><span><small>Won</small><strong>{metrics.won}</strong></span></div>
        </section>

        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Filter pipeline">
            {([
              ["all", "All", items.length],
              ["inquiry", "New", metrics.inquiries],
              ["active", "Active", metrics.active],
              ["proposal", "Proposal", metrics.proposals],
              ["won", "Won", metrics.won],
            ] as const).map(([id, label, count]) => (
              <button key={id} type="button" data-active={filter === id} onClick={() => setFilter(id)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <label className={styles.searchField}>
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, contact, or production" aria-label="Search sales pipeline" />
          </label>
        </div>

        {error ? <div className={styles.alert} role="alert">{error}</div> : null}

        <section className={styles.tableSurface} aria-label="Sales pipeline">
          <table>
            <thead>
              <tr>
                <th>Production</th>
                <th>Stage</th>
                <th>Contact</th>
                <th>Probability</th>
                <th>Expected close</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><span className={styles.loadingRow}><LoaderCircle size={17} /> Loading pipeline authority</span></td></tr>
              ) : filteredItems.map((item) => (
                <tr key={item.inquiry_id}>
                  <td>
                    <button type="button" className={styles.leadIdentity} onClick={() => openLead(item)}>
                      <span className={styles.companyMark}>{item.account_name.slice(0, 2).toUpperCase()}</span>
                      <span><strong>{item.opportunity_name}</strong><small>{item.account_name} · Updated {relativeDate(item.updated_at)}</small></span>
                    </button>
                  </td>
                  <td><span className={styles.stage} data-stage={item.stage}>{stageLabel(item.stage)}</span></td>
                  <td><strong className={styles.contactName}>{item.contact_name}</strong></td>
                  <td>{probabilityLabel(item.probability_basis_points)}</td>
                  <td>{shortDate(item.expected_close_date)}</td>
                  <td><button type="button" className={styles.rowButton} onClick={() => openLead(item)} aria-label={`Open ${item.opportunity_name}`}><ArrowRight size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredItems.length === 0 ? (
            <div className={styles.emptyState}><Filter size={20} /><strong>No matching sales records</strong><span>Change the search or stage filter.</span></div>
          ) : null}
        </section>

        <section className={styles.mobileList} aria-label="Sales pipeline">
          {loading ? <span className={styles.loadingRow}><LoaderCircle size={17} /> Loading pipeline authority</span> : filteredItems.map((item) => (
            <button key={item.inquiry_id} type="button" onClick={() => openLead(item)}>
              <span className={styles.mobileLeadHeader}><span className={styles.companyMark}>{item.account_name.slice(0, 2).toUpperCase()}</span><span className={styles.stage} data-stage={item.stage}>{stageLabel(item.stage)}</span></span>
              <strong>{item.opportunity_name}</strong>
              <small>{item.account_name} · {item.contact_name}</small>
              <span className={styles.mobileLeadMeta}><span>{probabilityLabel(item.probability_basis_points)}</span><span>{shortDate(item.expected_close_date)}</span><ArrowRight size={15} /></span>
            </button>
          ))}
          {!loading && filteredItems.length === 0 ? <div className={styles.emptyState}><Filter size={20} /><strong>No matching sales records</strong><span>Change the search or stage filter.</span></div> : null}
        </section>
      </div>

      {drawerMode ? (
        <div className={styles.drawerOverlay} role="presentation" onMouseDown={() => setDrawerMode(null)}>
          <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-label={drawerMode === "forms" ? "Intake forms" : "Sales record"} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.drawerHeader}>
              <div>
                <span>{drawerMode === "forms" ? "Lead capture" : selected?.account_name ?? "Sales record"}</span>
                <h2>{drawerMode === "forms" ? "Intake forms" : selected?.opportunity_name ?? "Sales record"}</h2>
              </div>
              <button ref={closeRef} type="button" className={styles.iconButton} onClick={() => setDrawerMode(null)} aria-label="Close drawer"><X size={19} /></button>
            </header>

            {drawerMode === "forms" ? (
              <div className={styles.drawerBody}>
                <section className={styles.drawerIntro}>
                  <Link2 size={18} />
                  <div><strong>One intake authority</strong><span>Each active key routes client discovery into this team’s qualification queue.</span></div>
                </section>
                {formsError ? <div className={styles.alert} role="alert">{formsError}</div> : null}
                <div className={styles.formList}>
                  {formsLoading ? <span className={styles.loadingRow}><LoaderCircle size={17} /> Loading intake forms</span> : forms.map((form) => {
                    const formKey = form.form_key ?? form.opaque_key;
                    const inquiryHref = formKey && form.status === "active"
                      ? `/inquire/${encodeURIComponent(formKey)}${demoMode ? "?demo=1" : ""}`
                      : null;
                    return <article key={form.id}>
                      <div><span className={styles.stage} data-stage={form.status}>{titleCase(form.status)}</span><small>{shortDate(form.created_at)}</small></div>
                      <strong>{form.name}</strong>
                      <span>{form.success_message ?? "Default receipt message"}</span>
                      {inquiryHref ? (
                        <div className={styles.formLinkActions}>
                          <Link href={inquiryHref} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open form</Link>
                          <button type="button" onClick={() => void copyInquiryLink(form.id, inquiryHref)}><Copy size={14} />{copied === form.id ? "Copied" : "Copy inquiry link"}</button>
                        </div>
                      ) : <small>{form.status === "disabled" ? "Disabled forms cannot receive new inquiries." : "Public key was not returned by this authority."}</small>}
                    </article>;
                  })}
                </div>
                <form className={styles.createForm} onSubmit={createIntakeForm}>
                  <div className={styles.sectionHeading}><Plus size={16} /><strong>Create intake form</strong></div>
                  <label><span>Name</span><input required value={newFormName} onChange={(event) => setNewFormName(event.target.value)} placeholder="New production inquiry" /></label>
                  <label><span>Success message</span><textarea rows={3} value={newFormMessage} onChange={(event) => setNewFormMessage(event.target.value)} placeholder="Tell the client what happens next." /></label>
                  <button className={styles.primaryButton} type="submit" disabled={creatingForm || !newFormName.trim()}>{creatingForm ? <LoaderCircle size={16} /> : <Plus size={16} />} Create form</button>
                </form>
              </div>
            ) : (
              <div className={styles.drawerBody}>
                {selected ? <div className={styles.recordSummary}>
                  <span className={styles.stage} data-stage={selected.stage}>{stageLabel(selected.stage)}</span>
                  <dl>
                    <div><dt>Contact</dt><dd>{selected.contact_name}</dd></div>
                    <div><dt>Probability</dt><dd>{probabilityLabel(selected.probability_basis_points)}</dd></div>
                    <div><dt>Expected close</dt><dd>{shortDate(selected.expected_close_date)}</dd></div>
                    <div><dt>Updated</dt><dd>{relativeDate(selected.updated_at)}</dd></div>
                  </dl>
                </div> : null}

                {selected && activationSummary(selected) ? (() => {
                  const activation = activationSummary(selected);
                  if (!activation) return null;
                  return <section className={styles.activationStatus} data-status={activation.state} aria-label="Production activation status">
                    {activation.state === "active" ? <ShieldCheck size={17} /> : <Handshake size={17} />}
                    <span><strong>{activation.label}</strong><small>{activation.detail}</small></span>
                    {activation.projectId ? <Link href={`/projects/${encodeURIComponent(activation.projectId)}${demoMode ? "?demo=1" : ""}`}>Open project <ArrowRight size={14} /></Link> : null}
                  </section>;
                })() : null}

                {drawerError ? <div className={styles.alert} role="alert">{drawerError}</div> : null}
                {drawerNotice ? <div className={styles.notice} role="status"><ShieldCheck size={16} />{drawerNotice}</div> : null}
                {detailError ? <div className={styles.alert} role="alert">{detailError}</div> : null}
                {detailLoading ? <span className={styles.loadingRow}><LoaderCircle size={17} /> Loading inquiry authority</span> : null}

                {detail && !editingQualification ? <>
                  <section className={styles.detailSection}>
                    <div className={styles.sectionHeading}><BriefcaseBusiness size={16} /><strong>Discovery</strong></div>
                    <p>{detail.inquiry.project.notes ?? "No additional notes were supplied."}</p>
                    <dl className={styles.detailGrid}>
                      <div><dt>Email</dt><dd>{detail.inquiry.contact.email}</dd></div>
                      <div><dt>Phone</dt><dd>{detail.inquiry.contact.phone ?? "Not supplied"}</dd></div>
                      <div><dt>Budget signal</dt><dd>{budgetLabel(detail.inquiry.budgetSignal.band)}</dd></div>
                      <div><dt>Requested due date</dt><dd>{shortDate(detail.inquiry.timeline.dueDate)}</dd></div>
                    </dl>
                  </section>
                  <section className={styles.detailSection}>
                    <div className={styles.sectionHeading}><ClipboardCheck size={16} /><strong>Requested work</strong></div>
                    <div className={styles.listGroup}><span>Objectives</span>{detail.inquiry.project.goals.map((item) => <p key={item}>{item}</p>)}</div>
                    <div className={styles.listGroup}><span>Deliverables</span>{detail.inquiry.project.requestedDeliverables.map((item) => <p key={item}>{item}</p>)}</div>
                  </section>
                  {detail.inquiry.attachments.length > 0 ? (
                    <section className={styles.detailSection}>
                      <div className={styles.sectionHeading}><Paperclip size={16} /><strong>Reference files</strong></div>
                      <div className={styles.attachmentList}>
                        {detail.inquiry.attachments.map((attachment) => (
                          <article key={attachment.id}>
                            <div>
                              <strong>{attachment.filename}</strong>
                              <span>{fileSize(attachment.sizeBytes)} &middot; {attachment.mimeType}</span>
                              {attachment.contentHash ? <code title={attachment.contentHash}>{attachment.contentHash.slice(0, 20)}...</code> : null}
                            </div>
                            <span data-verdict={attachment.scanVerdict ?? "pending"}>{scanLabel(attachment.scanVerdict)}</span>
                          </article>
                        ))}
                      </div>
                      <p>Files stay non-downloadable until storage and safety checks release them.</p>
                    </section>
                  ) : null}
                  {!selected?.opportunity_id && canQualify ? (
                    <button className={styles.primaryButton} type="button" onClick={beginQualification}><Sparkles size={16} /> Qualify inquiry</button>
                  ) : null}
                  {selected?.opportunity_id ? (
                    <section className={styles.proposalSection}>
                      <div><FileInput size={17} /><span><strong>Proposal handoff</strong><small>Pricing stays in Proposal Studio. Co-VideoPro provides verified client and brief context.</small></span></div>
                      <div className={styles.proposalStatus}>
                        <span className={styles.stage} data-stage={selected.brief_status ?? selected.stage}>{selected.brief_status === "ready_for_proposal" ? "Brief ready" : `Brief v${selected.brief_revision_number ?? "-"}`}</span>
                        <small>{stageLabel(selected.stage)}</small>
                      </div>
                      {PROPOSAL_REQUESTABLE_STAGES.has(selected.stage) && selected.brief_status === "draft" ? <button className={styles.primaryButton} type="button" onClick={() => void requestProposal()} disabled={proposalRequestLoading || !canQualify} aria-busy={proposalRequestLoading}>{proposalRequestLoading ? <LoaderCircle size={16} /> : <FileInput size={16} />} Request proposal</button> : null}
                      {PROPOSAL_CONTEXT_STAGES.has(selected.stage) && selected.brief_status === "ready_for_proposal" && !proposal ? <button className={styles.secondaryButton} type="button" onClick={() => void loadProposalContext()} disabled={proposalLoading}>{proposalLoading ? <LoaderCircle size={16} /> : <ArrowRight size={16} />} Load handoff context</button> : null}
                      {proposal ? <ProposalContextView proposal={proposal} copied={copied} onCopy={copyValue} /> : null}
                    </section>
                  ) : null}
                </> : null}

                {detail && qualification && editingQualification ? (
                  <QualificationForm draft={qualification} saving={saving} onChange={updateDraft} onCancel={() => setEditingQualification(false)} onSubmit={submitQualification} />
                ) : null}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SalesState({ kind }: { kind: "loading" | "unavailable" }) {
  const loading = kind === "loading";
  return <div className={styles.statePage}><section className={styles.stateSurface} role={loading ? "status" : "alert"} aria-busy={loading}>
    <header><span>Business development</span><h1>Sales & intake</h1></header>
    <div><span className={styles.stateIcon}>{loading ? <LoaderCircle size={20} /> : <ShieldCheck size={20} />}</span><p><strong>{loading ? "Loading sales authority" : "Sales access is unavailable"}</strong><span>{loading ? "Verifying your team and role." : "Owner, admin, or producer access is required."}</span></p></div>
  </section></div>;
}

function QualificationForm({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: QualificationDraft;
  saving: boolean;
  onChange: (field: keyof QualificationDraft, value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <form className={styles.qualificationForm} onSubmit={onSubmit}>
    <div className={styles.sectionHeading}><Sparkles size={16} /><strong>Qualify inquiry</strong></div>
    <p>This creates the account, contact, opportunity, and first versioned creative brief in one transaction.</p>
    <div className={styles.twoColumn}>
      <label><span>Company</span><input required value={draft.companyName} onChange={(event) => onChange("companyName", event.target.value)} /></label>
      <label><span>Company website</span><input type="url" value={draft.companyWebsite} onChange={(event) => onChange("companyWebsite", event.target.value)} /></label>
      <label><span>Contact</span><input required value={draft.contactName} onChange={(event) => onChange("contactName", event.target.value)} /></label>
      <label><span>Contact email</span><input required type="email" value={draft.contactEmail} onChange={(event) => onChange("contactEmail", event.target.value)} /></label>
      <label><span>Contact phone</span><input value={draft.contactPhone} onChange={(event) => onChange("contactPhone", event.target.value)} /></label>
      <label><span>Contact title</span><input value={draft.contactTitle} onChange={(event) => onChange("contactTitle", event.target.value)} /></label>
      <label className={styles.wideField}><span>Opportunity name</span><input required value={draft.opportunityName} onChange={(event) => onChange("opportunityName", event.target.value)} /></label>
      <label><span>Probability</span><div className={styles.numberField}><input type="number" min="0" max="100" value={draft.probabilityPercent} onChange={(event) => onChange("probabilityPercent", event.target.value)} /><b>%</b></div></label>
      <label><span>Expected close</span><input type="date" value={draft.expectedCloseDate} onChange={(event) => onChange("expectedCloseDate", event.target.value)} /></label>
      <label className={styles.wideField}><span>Brief title</span><input required value={draft.briefTitle} onChange={(event) => onChange("briefTitle", event.target.value)} /></label>
    </div>
    {([
      ["objectives", "Objectives", "One item per line", true],
      ["audiences", "Audiences", "One audience per line", false],
      ["keyMessages", "Key messages", "One message per line", false],
      ["deliverables", "Deliverables", "One deliverable per line", false],
      ["constraints", "Constraints", "One constraint per line", false],
      ["references", "References", "One HTTPS link per line", false],
      ["successCriteria", "Success criteria", "One outcome per line", false],
    ] as const).map(([field, label, placeholder, required]) => <label key={field}><span>{label}</span><textarea required={required} rows={3} value={draft[field]} onChange={(event) => onChange(field, event.target.value)} placeholder={placeholder} /></label>)}
    <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? <LoaderCircle size={16} /> : <Check size={16} />} Confirm qualification</button></div>
  </form>;
}

function ProposalContextView({ proposal, copied, onCopy }: { proposal: ProposalContext; copied: string; onCopy: (key: string, value: string) => Promise<void> }) {
  const copyPayload = JSON.stringify(proposal.handoffOrigin ?? {}, null, 2);
  const requestedWindow = proposal.proposalStudioImport?.requestedProductionWindow;
  const requestedWindowLabel = !requestedWindow
    ? "Not supplied"
    : requestedWindow.desiredStartDate && requestedWindow.dueDate
      ? `${shortDate(requestedWindow.desiredStartDate)} - ${shortDate(requestedWindow.dueDate)}`
      : requestedWindow.desiredStartDate
        ? `Start ${shortDate(requestedWindow.desiredStartDate)}`
        : requestedWindow.dueDate
          ? `Due ${shortDate(requestedWindow.dueDate)}`
          : "Dates not supplied";
  return <div className={styles.proposalContext}>
    <div className={styles.authorityLine}><ShieldCheck size={15} /><span>Verified by {proposal.handoffOrigin?.authority === "co-videopro-crm" ? "Co-VideoPro CRM" : "CRM authority"}</span><button type="button" onClick={() => void onCopy("handoff", copyPayload)}><Copy size={14} />{copied === "handoff" ? "Copied" : "Copy origin"}</button></div>
    <dl className={styles.detailGrid}>
      <div><dt>Client</dt><dd>{proposal.client?.displayName ?? "Not supplied"}</dd></div>
      <div><dt>Contact</dt><dd>{proposal.contact?.name ?? "Not supplied"}</dd></div>
      <div><dt>Brief revision</dt><dd>v{proposal.brief?.revisionNumber ?? "-"}</dd></div>
      <div><dt>Pricing</dt><dd>{proposal.pricingIncluded ? "Included" : "Proposal Studio authority"}</dd></div>
      <div><dt>Requested production</dt><dd>{requestedWindowLabel}</dd></div>
      <div><dt>Timing flexibility</dt><dd>{requestedWindow?.flexibility ? titleCase(requestedWindow.flexibility) : "Not supplied"}</dd></div>
    </dl>
    <div className={styles.listGroup}><span>Objectives</span>{proposal.brief?.objectives?.map((item) => <p key={item}>{item}</p>) ?? <p>None supplied</p>}</div>
    <div className={styles.listGroup}><span>Deliverables</span>{proposal.brief?.requestedDeliverables?.map((item) => <p key={item}>{item}</p>) ?? <p>None supplied</p>}</div>
  </div>;
}
