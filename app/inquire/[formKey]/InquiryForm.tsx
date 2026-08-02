"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  Film,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { useDemoMode } from "@/lib/demo/mode";
import IntakeAttachments, {
  type IntakeAttachmentClaim,
  type IntakeAttachmentGate,
} from "./IntakeAttachments";
import styles from "./InquiryPage.module.css";

const FORM_KEY_PATTERN = /^ifm_[0-9a-f]{64}$/;
const PRIVACY_POLICY_VERSION = "privacy.2026-07";
const EMPTY_ATTACHMENT_CLAIM: IntakeAttachmentClaim = {
  batchToken: null,
  attachments: [],
};

type Step = 1 | 2 | 3;

interface FormMetadata {
  name: string;
  successMessage: string | null;
}

interface InquiryValues {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  companyName: string;
  companyWebsite: string;
  projectTitle: string;
  goals: string;
  audiences: string;
  deliverables: string;
  references: string;
  constraints: string;
  notes: string;
  desiredStartDate: string;
  dueDate: string;
  flexibility: "fixed" | "somewhat_flexible" | "flexible" | "unknown";
  budgetBand: "unknown" | "under_10k" | "10k_25k" | "25k_50k" | "50k_100k" | "over_100k";
  privacyAccepted: boolean;
  marketingEmailOptIn: boolean;
  operationalSmsOptIn: boolean;
  operationalImessageOptIn: boolean;
  website: string;
}

const INITIAL_VALUES: InquiryValues = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  companyName: "",
  companyWebsite: "",
  projectTitle: "",
  goals: "",
  audiences: "",
  deliverables: "",
  references: "",
  constraints: "",
  notes: "",
  desiredStartDate: "",
  dueDate: "",
  flexibility: "unknown",
  budgetBand: "unknown",
  privacyAccepted: false,
  marketingEmailOptIn: false,
  operationalSmsOptIn: false,
  operationalImessageOptIn: false,
  website: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lineItems(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

function normalizeHttpsUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:") throw new Error("not_https");
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTPS address.`);
  }
}

function normalizeReferences(value: string) {
  return lineItems(value).map((reference, index) =>
    normalizeHttpsUrl(reference, `Reference ${index + 1}`) as string,
  );
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateStep(step: Step, values: InquiryValues) {
  if (step === 1) {
    if (!values.contactName.trim() || !values.companyName.trim()) {
      return "Add your name and company before continuing.";
    }
    if (!validEmail(values.contactEmail)) return "Enter a valid email address.";
    if (values.contactPhone.trim() && !/^\+[1-9]\d{7,14}$/.test(values.contactPhone.trim())) {
      return "Use an international phone number such as +19155550123.";
    }
    try {
      normalizeHttpsUrl(values.companyWebsite, "Company website");
    } catch (error) {
      return error instanceof Error ? error.message : "Company website is invalid.";
    }
  }
  if (step === 2) {
    if (!values.projectTitle.trim()) return "Add a working title for this production.";
    if (lineItems(values.goals).length === 0) return "Add at least one production goal.";
    try {
      normalizeReferences(values.references);
    } catch (error) {
      return error instanceof Error ? error.message : "One of the references is invalid.";
    }
  }
  if (step === 3) {
    if (
      values.desiredStartDate &&
      values.dueDate &&
      values.dueDate < values.desiredStartDate
    ) {
      return "The requested due date cannot be earlier than the desired start date.";
    }
    if (!values.privacyAccepted) return "Privacy consent is required to submit this inquiry.";
    if (
      !values.contactPhone.trim() &&
      (values.operationalSmsOptIn || values.operationalImessageOptIn)
    ) {
      return "Add a phone number before choosing SMS or iMessage updates.";
    }
  }
  return "";
}

export default function InquiryForm({ formKey }: { formKey: string }) {
  const demoMode = useDemoMode();
  const normalizedKey = formKey.trim().toLowerCase();
  const [metadata, setMetadata] = useState<FormMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<InquiryValues>(INITIAL_VALUES);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{
    requestId: string;
    attachmentCount: number;
  } | null>(null);
  const [attachmentClaim, setAttachmentClaim] = useState<IntakeAttachmentClaim>(
    EMPTY_ATTACHMENT_CLAIM,
  );
  const [attachmentGate, setAttachmentGate] = useState<IntakeAttachmentGate>({
    busy: false,
    hasErrors: false,
    count: 0,
  });
  const requestIdentity = useRef<{ fingerprint: string; key: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!FORM_KEY_PATTERN.test(normalizedKey)) {
      setMetadataError("This inquiry form is not available.");
      setMetadataLoading(false);
      return;
    }
    if (demoMode) {
      setMetadata({
        name: "New production inquiry",
        successMessage: "Your production inquiry is in. Our team will follow up shortly.",
      });
      setMetadataLoading(false);
      return;
    }
    const controller = new AbortController();
    setMetadataLoading(true);
    void fetch(`/api/intake/forms/${encodeURIComponent(normalizedKey)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isRecord(payload) || !isRecord(payload.form)) {
          throw new Error(errorMessage(payload, "This inquiry form is not available."));
        }
        setMetadata({
          name: typeof payload.form.name === "string" ? payload.form.name : "Production inquiry",
          successMessage:
            typeof payload.form.successMessage === "string"
              ? payload.form.successMessage
              : null,
        });
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setMetadataError(
          caught instanceof Error ? caught.message : "This inquiry form is not available.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetadataLoading(false);
      });
    return () => controller.abort();
  }, [demoMode, normalizedKey]);

  const completion = Math.round((step / 3) * 100);
  const stepSummary = useMemo(() => {
    if (step === 1) return "Tell us who we should work with.";
    if (step === 2) return "Describe the production and the result you need.";
    return "Set expectations and choose how we may respond.";
  }, [step]);

  function update<K extends keyof InquiryValues>(key: K, value: InquiryValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  }

  function showError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => errorRef.current?.focus());
  }

  function nextStep() {
    const message = validateStep(step, values);
    if (message) {
      showError(message);
      return;
    }
    if (step === 2 && attachmentGate.busy) {
      showError("Wait for each reference file to finish uploading before continuing.");
      return;
    }
    if (step === 2 && attachmentGate.hasErrors) {
      showError("Retry or remove files that need attention before continuing.");
      return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(1, current - 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitInquiry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !metadata) return;
    const validationError = validateStep(3, values);
    if (validationError) {
      showError(validationError);
      return;
    }
    if (attachmentGate.busy || attachmentGate.hasErrors) {
      showError(
        attachmentGate.busy
          ? "Wait for each reference file to finish uploading before submitting."
          : "Retry or remove files that need attention before submitting.",
      );
      return;
    }

    let companyWebsite: string | null;
    let references: string[];
    try {
      companyWebsite = normalizeHttpsUrl(values.companyWebsite, "Company website");
      references = normalizeReferences(values.references);
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "A web address is invalid.");
      return;
    }

    const submissionBase = {
      schemaVersion: "cco.public-inquiry.v1" as const,
      formKey: normalizedKey,
      contact: {
        name: values.contactName.trim(),
        email: values.contactEmail.trim().toLowerCase(),
        phone: values.contactPhone.trim() || null,
      },
      company: {
        name: values.companyName.trim(),
        website: companyWebsite,
      },
      project: {
        title: values.projectTitle.trim(),
        goals: lineItems(values.goals),
        audiences: lineItems(values.audiences),
        requestedDeliverables: lineItems(values.deliverables),
        references,
        constraints: lineItems(values.constraints),
        notes: values.notes.trim() || null,
      },
      timeline: {
        desiredStartDate: values.desiredStartDate || null,
        dueDate: values.dueDate || null,
        flexibility: values.flexibility,
      },
      budgetSignal: { band: values.budgetBand },
      consent: {
        privacyAccepted: true as const,
        policyVersion: PRIVACY_POLICY_VERSION,
        marketingEmailOptIn: values.marketingEmailOptIn,
        operationalSmsOptIn: values.operationalSmsOptIn,
        operationalImessageOptIn: values.operationalImessageOptIn,
      },
      website: values.website,
    };
    const fingerprint = JSON.stringify({
      inquiry: submissionBase,
      attachments: attachmentClaim.attachments,
    });
    if (!requestIdentity.current || requestIdentity.current.fingerprint !== fingerprint) {
      requestIdentity.current = { fingerprint, key: crypto.randomUUID() };
    }
    const inquiry = {
      ...submissionBase,
      idempotencyKey: requestIdentity.current.key,
    };
    const submission = {
      schemaVersion: "cco.public-inquiry-request.v2" as const,
      inquiry,
      attachmentClaim,
    };

    setSubmitting(true);
    setError("");
    try {
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 420));
        setReceipt({
          requestId: crypto.randomUUID(),
          attachmentCount: attachmentGate.count,
        });
        return;
      }
      const response = await fetch("/api/intake/inquiries", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(submission),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload) || typeof payload.requestId !== "string") {
        throw new Error(errorMessage(payload, "Your inquiry could not be submitted."));
      }
      setReceipt({
        requestId: payload.requestId,
        attachmentCount:
          typeof payload.attachmentCount === "number"
            ? payload.attachmentCount
            : attachmentGate.count,
      });
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Your inquiry could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleAttachmentClaim = useCallback((claim: IntakeAttachmentClaim) => {
    setAttachmentClaim(claim);
  }, []);

  const handleAttachmentGate = useCallback((gate: IntakeAttachmentGate) => {
    setAttachmentGate(gate);
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="https://www.contentco-op.com" aria-label="Content Co-op home">
          <CoProductionBrand className={styles.brand} priority />
        </Link>
        <span><LockKeyhole size={14} /> Secure inquiry</span>
      </header>

      <div className={styles.shell}>
        <aside className={styles.contextRail} aria-label="Inquiry progress">
          <span className={styles.eyebrow}>Start a production</span>
          <h1>{metadata?.name ?? "Production inquiry"}</h1>
          <p>Share the context once. It will move with the production from planning through delivery.</p>
          <ol>
            {([
              [1, "Contact", "Who we should work with", Building2],
              [2, "Production", "Goals, audience, and deliverables", Film],
              [3, "Timing", "Schedule, budget, and consent", ShieldCheck],
            ] as const).map(([number, label, description, Icon]) => (
              <li key={number} data-current={step === number} data-complete={step > number || Boolean(receipt)}>
                <span>{step > number || receipt ? <Check size={15} /> : <Icon size={15} />}</span>
                <div><strong>{label}</strong><small>{description}</small></div>
              </li>
            ))}
          </ol>
          <footer><Mail size={15} /><span>Questions?</span><a href="mailto:hello@contentco-op.com">hello@contentco-op.com</a></footer>
        </aside>

        <section className={styles.formSurface} aria-live="polite">
          {metadataLoading ? <InquiryState kind="loading" /> : metadataError || !metadata ? <InquiryState kind="unavailable" message={metadataError} /> : receipt ? (
            <div className={styles.successState}>
              <span><CircleCheck size={28} /></span>
              <div><span>Inquiry received</span><h2>Thank you, {values.contactName.split(" ")[0] || "there"}.</h2></div>
              <p>{metadata.successMessage ?? "Your inquiry is now in the Content Co-op production queue."}</p>
              <dl><dt>Confirmation</dt><dd>{receipt.requestId}</dd></dl>
              <p className={styles.successNote}>Your goals, requested deliverables, timing, communication choices{receipt.attachmentCount > 0 ? `, and ${receipt.attachmentCount} reference ${receipt.attachmentCount === 1 ? "file" : "files"}` : ""} are attached to this production inquiry.</p>
            </div>
          ) : (
            <form onSubmit={submitInquiry} aria-busy={submitting} noValidate>
              <header className={styles.formHeader}>
                <div><span>Step {step} of 3</span><h2>{step === 1 ? "Contact and company" : step === 2 ? "Production brief" : "Timing and permissions"}</h2><p>{stepSummary}</p></div>
                <strong>{completion}%</strong>
              </header>
              <div className={styles.progressTrack} aria-hidden="true"><i style={{ width: `${completion}%` }} /></div>

              {error ? <div ref={errorRef} className={styles.alert} role="alert" tabIndex={-1}>{error}</div> : null}

              {step === 1 ? <ContactStep values={values} update={update} /> : null}
              {step === 2 ? <ProductionStep values={values} update={update} /> : null}
              {step === 3 ? <TimingStep values={values} update={update} /> : null}
              <div className={styles.attachmentStage} hidden={step !== 2}>
                <IntakeAttachments
                  formKey={normalizedKey}
                  demoMode={demoMode}
                  onClaimChange={handleAttachmentClaim}
                  onGateChange={handleAttachmentGate}
                />
              </div>

              <input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(event) => update("website", event.target.value)} aria-hidden="true" />

              <footer className={styles.formFooter}>
                {step > 1 ? <button type="button" className={styles.secondaryButton} onClick={previousStep}><ArrowLeft size={16} /> Back</button> : <span />}
                {step < 3 ? <button type="button" className={styles.primaryButton} onClick={nextStep} disabled={step === 2 && attachmentGate.busy}>Continue <ArrowRight size={16} /></button> : <button type="submit" className={styles.primaryButton} disabled={submitting || attachmentGate.busy}>{submitting ? <LoaderCircle size={16} /> : <Send size={16} />}{submitting ? "Submitting..." : "Submit inquiry"}</button>}
              </footer>
            </form>
          )}
        </section>
      </div>
      <footer className={styles.pageFooter}>Co-VideoPro by Content Co-op · Production context stays connected.</footer>
    </main>
  );
}

function InquiryState({ kind, message }: { kind: "loading" | "unavailable"; message?: string }) {
  const loading = kind === "loading";
  return <div className={styles.state} role={loading ? "status" : "alert"} aria-busy={loading}>
    <span>{loading ? <LoaderCircle size={22} /> : <ShieldCheck size={22} />}</span>
    <div><strong>{loading ? "Loading inquiry" : "Inquiry form unavailable"}</strong><p>{loading ? "Verifying the active intake authority." : message || "This form may be inactive or the link may be incomplete."}</p></div>
  </div>;
}

function ContactStep({ values, update }: StepProps) {
  return <div className={styles.fields}>
    <label><span>Your name <b>Required</b></span><input autoFocus autoComplete="name" value={values.contactName} onChange={(event) => update("contactName", event.target.value)} placeholder="Name" /></label>
    <label><span>Work email <b>Required</b></span><input type="email" inputMode="email" autoComplete="email" value={values.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} placeholder="name@company.com" /></label>
    <label><span>Phone</span><input type="tel" inputMode="tel" autoComplete="tel" value={values.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} placeholder="+19155550123" /></label>
    <label><span>Company <b>Required</b></span><input autoComplete="organization" value={values.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder="Company or organization" /></label>
    <label className={styles.wide}><span>Company website</span><input type="url" inputMode="url" autoComplete="url" value={values.companyWebsite} onChange={(event) => update("companyWebsite", event.target.value)} placeholder="https://company.com" /></label>
  </div>;
}

function ProductionStep({ values, update }: StepProps) {
  return <div className={styles.fields}>
    <label className={styles.wide}><span>Working production title <b>Required</b></span><input autoFocus value={values.projectTitle} onChange={(event) => update("projectTitle", event.target.value)} placeholder="A clear name for this production" /></label>
    <label className={styles.wide}><span>Goals <b>Required</b></span><textarea rows={4} value={values.goals} onChange={(event) => update("goals", event.target.value)} placeholder="One goal per line" /></label>
    <label><span>Primary audiences</span><textarea rows={4} value={values.audiences} onChange={(event) => update("audiences", event.target.value)} placeholder="One audience per line" /></label>
    <label><span>Requested deliverables</span><textarea rows={4} value={values.deliverables} onChange={(event) => update("deliverables", event.target.value)} placeholder="Hero film&#10;Social cutdowns&#10;Captioned master" /></label>
    <label><span>Reference links</span><textarea rows={4} value={values.references} onChange={(event) => update("references", event.target.value)} placeholder="One HTTPS link per line" /></label>
    <label><span>Constraints or requirements</span><textarea rows={4} value={values.constraints} onChange={(event) => update("constraints", event.target.value)} placeholder="Locations, legal, brand, access, or review requirements" /></label>
    <label className={styles.wide}><span>Additional context</span><textarea rows={4} value={values.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Anything else the production team should understand" /></label>
  </div>;
}

function TimingStep({ values, update }: StepProps) {
  const hasPhone = Boolean(values.contactPhone.trim());
  return <div className={styles.fields}>
    <label><span>Desired start</span><input autoFocus type="date" value={values.desiredStartDate} onChange={(event) => update("desiredStartDate", event.target.value)} /></label>
    <label><span>Requested due date</span><input type="date" value={values.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></label>
    <label><span>Timeline flexibility</span><select value={values.flexibility} onChange={(event) => update("flexibility", event.target.value as InquiryValues["flexibility"])}><option value="unknown">Not sure yet</option><option value="fixed">Fixed</option><option value="somewhat_flexible">Somewhat flexible</option><option value="flexible">Flexible</option></select></label>
    <label><span>Budget range</span><select value={values.budgetBand} onChange={(event) => update("budgetBand", event.target.value as InquiryValues["budgetBand"])}><option value="unknown">Prefer to discuss</option><option value="under_10k">Under $10K</option><option value="10k_25k">$10K-$25K</option><option value="25k_50k">$25K-$50K</option><option value="50k_100k">$50K-$100K</option><option value="over_100k">$100K+</option></select></label>
    <fieldset className={styles.consentGroup}>
      <legend>Communication permissions</legend>
      <label><input type="checkbox" checked={values.privacyAccepted} onChange={(event) => update("privacyAccepted", event.target.checked)} /><span><strong>Required</strong> Content Co-op may use this information to respond to and plan this production inquiry.</span></label>
      <label><input type="checkbox" checked={values.marketingEmailOptIn} onChange={(event) => update("marketingEmailOptIn", event.target.checked)} /><span>Email me relevant production updates and resources.</span></label>
      <label data-disabled={!hasPhone}><input type="checkbox" disabled={!hasPhone} checked={values.operationalSmsOptIn} onChange={(event) => update("operationalSmsOptIn", event.target.checked)} /><span>Send operational project updates by SMS.</span></label>
      <label data-disabled={!hasPhone}><input type="checkbox" disabled={!hasPhone} checked={values.operationalImessageOptIn} onChange={(event) => update("operationalImessageOptIn", event.target.checked)} /><span>Use iMessage for operational updates when available.</span></label>
      {!hasPhone ? <small>Add a phone number in Contact to enable text permissions.</small> : null}
    </fieldset>
  </div>;
}

interface StepProps {
  values: InquiryValues;
  update: <K extends keyof InquiryValues>(key: K, value: InquiryValues[K]) => void;
}
