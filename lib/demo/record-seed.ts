/**
 * Demo seed for the Project Operating Record collections.
 *
 * A realistic mid-sized production slate: clients at every lifecycle stage,
 * changing briefs, proposal versions, plan items, transcript selects, a
 * radio-cut sequence, an open revision round, decisions, and deliverables.
 * No idealized single-happy-path data (see docs/COVIDEOPRO_PRODUCT_MODEL.md).
 */

import type {
  Brief,
  CallSheet,
  Contact,
  CrewMember,
  Decision,
  Deliverable,
  DiscoveryAnswer,
  DiscoverySession,
  Inquiry,
  Location,
  NotificationOutboxItem,
  Organization,
  PaymentMilestone,
  PlanItem,
  ProductionDay,
  Proposal,
  Release,
  RevisionRequest,
  Select,
  Sequence,
  SequenceClip,
} from "@/lib/covideopro/record.ts";

const T0 = "2026-07-10T15:00:00.000Z";
const T1 = "2026-07-13T16:30:00.000Z";
const T2 = "2026-07-14T20:10:00.000Z";
const T3 = "2026-07-15T18:45:00.000Z";
const BAILEY = "user-bailey";

/* ------------------------------- CRM -------------------------------------- */

export const seedOrganizations: Organization[] = [
  { id: "org-ica", name: "Industrial Contractors Association", industry: "Association / Energy", website: "https://ica.example", notes: "Annual roadshow + CERAWeek presence.", created_at: T0, updated_at: T2, created_by: BAILEY },
  { id: "org-schneider", name: "Schneider National", industry: "Logistics", website: "https://schneider.example", notes: "EPC partnership content + podcast series.", created_at: T0, updated_at: T1, created_by: BAILEY },
  { id: "org-bp", name: "bp", industry: "Energy", website: "https://bp.example", notes: "Rodeo sponsorship and turnaround communications.", created_at: T0, updated_at: T3, created_by: BAILEY },
  { id: "org-conexon", name: "Conexon", industry: "Rural broadband", website: "https://conexon.example", notes: "Workshop series + recruitment content.", created_at: T0, updated_at: T3, created_by: BAILEY },
  { id: "org-hlsr", name: "Houston Livestock Show and Rodeo", industry: "Events", website: "https://hlsr.example", notes: "Inbound for 2027 season coverage.", created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedContacts: Contact[] = [
  { id: "contact-morgan-ica", organization_id: "org-ica", name: "Morgan Lee", email: "morgan@ica.example", role: "Director of Communications", is_primary: true, created_at: T0, updated_at: T2, created_by: BAILEY },
  { id: "contact-jordan-ica", organization_id: "org-ica", name: "Jordan Miles", email: "jordan@ica.example", role: "Events Manager", is_primary: false, created_at: T0, updated_at: T1, created_by: BAILEY },
  { id: "contact-dana-schneider", organization_id: "org-schneider", name: "Dana Whitfield", email: "dana@schneider.example", role: "Brand Content Lead", is_primary: true, created_at: T0, updated_at: T1, created_by: BAILEY },
  { id: "contact-rachel-bp", organization_id: "org-bp", name: "Rachel Osei", email: "rachel@bp.example", role: "External Affairs", is_primary: true, created_at: T0, updated_at: T3, created_by: BAILEY },
  { id: "contact-sam-conexon", organization_id: "org-conexon", name: "Sam Delgado", email: "sam@conexon.example", role: "Marketing Director", is_primary: true, created_at: T0, updated_at: T3, created_by: BAILEY },
  { id: "contact-priya-hlsr", organization_id: "org-hlsr", name: "Priya Natarajan", email: "priya@hlsr.example", role: "Media Relations", is_primary: true, created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedInquiries: Inquiry[] = [
  {
    id: "inq-hlsr-2027",
    project_id: null,
    organization_id: "org-hlsr",
    contact_id: "contact-priya-hlsr",
    source: "referral",
    summary: "2027 season: 20-day coverage, daily social cuts + a 6-minute season film. References our 2025 rodeo recap work.",
    received_at: T3,
    status: "new",
    created_at: T3, updated_at: T3, created_by: BAILEY,
  },
  {
    id: "inq-wendys-finalfour",
    project_id: null,
    organization_id: null,
    contact_id: null,
    source: "website",
    summary: "QSR brand activation recap for a spring tournament — needs a scoped reply this week. Contact details incomplete.",
    received_at: "2026-07-12T14:05:00.000Z",
    status: "triaged",
    created_at: "2026-07-12T14:05:00.000Z", updated_at: T2, created_by: BAILEY,
  },
];

/* ------------------------------ Creative ----------------------------------- */

export const seedBriefs: Brief[] = [
  {
    id: "brief-ica-v1", project_id: "ica", version: 1, status: "approved",
    objectives: "Open the ICA roadshow with a 60-second film that frames contractor craft as the backbone of the energy transition.",
    audience: "Roadshow attendees: contractors, operators, association leadership.",
    message: "Precision work, honored publicly.",
    references: ["2025 roadshow open", "CERAWeek speaker package"],
    deliverables_notes: "16:9 master, 9:16 social cut, captioned.",
    created_at: T0, updated_at: T1, created_by: BAILEY,
  },
  {
    id: "brief-conexon-v1", project_id: "conexon", version: 1, status: "superseded",
    objectives: "Recruitment cut from the fiber workshop footage.",
    audience: "Field technician candidates.",
    message: "Learn a trade that matters.",
    references: [], deliverables_notes: "",
    created_at: T1, updated_at: T2, created_by: BAILEY,
  },
  {
    id: "brief-conexon-v2", project_id: "conexon", version: 2, status: "in_review",
    objectives: "After the workshop, pivot from a recruitment cut to a customer-story film: rural co-op members describing what fiber changed.",
    audience: "Co-op boards and member communities considering fiber builds.",
    message: "Broadband that keeps towns alive.",
    references: ["Workshop day 1 interviews", "Board-meeting b-roll"],
    deliverables_notes: "3-minute hero + 30-second cutdown; captions; Spanish subtitles if budget allows.",
    created_at: T2, updated_at: T3, created_by: BAILEY,
  },
];

/* ------------------------------ Commercial --------------------------------- */

export const seedProposals: Proposal[] = [
  {
    id: "prop-ica-v2", project_id: "ica", version: 2, status: "approved",
    title: "ICA Roadshow 2026 — Opening Film Package",
    narrative: "Two production days, interview package, and post through final delivery. v2 adds the 9:16 social cut the client requested after the first scope call.",
    estimate_lines: [
      { id: "el-ica-1", category: "crew", description: "DP + audio, 2 shoot days", quantity: 4, unit_rate: 850, markup_pct: 10, optional: false },
      { id: "el-ica-2", category: "equipment", description: "Camera + lighting package", quantity: 2, unit_rate: 600, markup_pct: 10, optional: false },
      { id: "el-ica-3", category: "travel", description: "Mileage + lodging", quantity: 1, unit_rate: 480, markup_pct: 0, optional: false },
      { id: "el-ica-4", category: "post", description: "Edit, mix, color (master)", quantity: 1, unit_rate: 3200, markup_pct: 15, optional: false },
      { id: "el-ica-5", category: "deliverable", description: "9:16 social cutdown", quantity: 1, unit_rate: 900, markup_pct: 15, optional: false },
      { id: "el-ica-6", category: "post", description: "Spanish subtitles", quantity: 1, unit_rate: 450, markup_pct: 0, optional: true },
    ],
    valid_until: "2026-08-15",
    approved_by: "morgan@ica.example",
    approved_at: "2026-03-01T17:20:00.000Z",
    created_at: T0, updated_at: T1, created_by: BAILEY,
  },
  {
    id: "prop-conexon-v1", project_id: "conexon", version: 1, status: "sent",
    title: "Conexon Customer-Story Film",
    narrative: "One pickup shoot day at the co-op, then post on the hero film and cutdown. Scope reflects the v2 brief pivot from recruitment to customer story.",
    estimate_lines: [
      { id: "el-con-1", category: "crew", description: "Producer/shooter, 1 day", quantity: 2, unit_rate: 750, markup_pct: 10, optional: false },
      { id: "el-con-2", category: "travel", description: "Travel to co-op site", quantity: 1, unit_rate: 320, markup_pct: 0, optional: false },
      { id: "el-con-3", category: "post", description: "Edit + mix + color, hero film", quantity: 1, unit_rate: 2600, markup_pct: 15, optional: false },
      { id: "el-con-4", category: "deliverable", description: "30-second cutdown", quantity: 1, unit_rate: 650, markup_pct: 15, optional: false },
    ],
    valid_until: "2026-08-01",
    approved_by: null, approved_at: null,
    created_at: T2, updated_at: T3, created_by: BAILEY,
  },
];

/* ------------------------------ Planning ----------------------------------- */

export const seedPlanItems: PlanItem[] = [
  { id: "plan-bp-shoot-1", project_id: "bp", kind: "production_day", title: "Rodeo recap — day 1 (grounds + interviews)", date: "2026-07-18", assignee: "Bailey + Marcus", status: "pending", depends_on: [], meta: { location: "NRG Park", call_time: "06:30", crew: "DP, audio, PA" }, created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "plan-bp-milestone-rough", project_id: "bp", kind: "milestone", title: "Rough cut to Rachel", date: "2026-07-24", assignee: "Edit", status: "pending", depends_on: ["plan-bp-shoot-1"], meta: {}, created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "plan-bp-task-releases", project_id: "bp", kind: "task", title: "Collect appearance releases from interviewees", date: "2026-07-18", assignee: "PA", status: "in_progress", depends_on: [], meta: {}, created_at: T2, updated_at: T3, created_by: BAILEY },
  { id: "plan-conexon-brief", project_id: "conexon", kind: "milestone", title: "Brief v2 approved by Sam", date: "2026-07-17", assignee: "Sam Delgado", status: "in_progress", depends_on: [], meta: {}, created_at: T2, updated_at: T3, created_by: BAILEY },
  { id: "plan-conexon-pickup", project_id: "conexon", kind: "production_day", title: "Co-op pickup shoot (weather-dependent)", date: "2026-07-29", assignee: "Bailey", status: "pending", depends_on: ["plan-conexon-brief"], meta: { location: "Co-op service center", weather_watch: "Afternoon storms" }, created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "plan-ica-task-captions", project_id: "ica", kind: "task", title: "Caption pass on roadshow master", date: "2026-07-16", assignee: "Edit", status: "done", depends_on: [], meta: {}, created_at: T1, updated_at: T2, created_by: BAILEY },
];

/* ----------------------------- Media / Edit -------------------------------- */

export const seedSelects: Select[] = [
  { id: "sel-pod-1", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 6, out_seconds: 22, label: "Why the partnership started", source: "transcript", transcript_segment_ids: ["seg-21", "seg-22"], created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "sel-pod-2", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 40, out_seconds: 78, label: "The Nashville turnaround story", source: "transcript", transcript_segment_ids: ["seg-88", "seg-89", "seg-90"], created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "sel-pod-3", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 100, out_seconds: 138, label: "What's next for the fleet program", source: "transcript", transcript_segment_ids: ["seg-301"], created_at: T2, updated_at: T2, created_by: BAILEY },
];

export const seedSequences: Sequence[] = [
  { id: "seq-pod-radio-cut", project_id: "schneider-epc", name: "McLaren Podcast — radio cut", version: 1, status: "draft", fps: 24, created_from: "transcript-assembly", created_at: T2, updated_at: T3, created_by: BAILEY },
];

export const seedSequenceClips: SequenceClip[] = [
  { id: "clip-pod-1", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-1", track_index: 0, timeline_in_seconds: 0, timeline_out_seconds: 16, source_in_seconds: 6, source_out_seconds: 22 },
  { id: "clip-pod-2", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-2", track_index: 0, timeline_in_seconds: 16, timeline_out_seconds: 54, source_in_seconds: 40, source_out_seconds: 78 },
  { id: "clip-pod-3", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-3", track_index: 0, timeline_in_seconds: 54, timeline_out_seconds: 92, source_in_seconds: 100, source_out_seconds: 138 },
];

/* -------------------- Review consolidation / Delivery ----------------------- */

export const seedRevisionRequests: RevisionRequest[] = [
  {
    id: "rr-charles-r2", project_id: "ica", asset_id: "charles-drummond-v5", version_id: null,
    round: 2, status: "in_progress",
    summary: "Round 2 consolidation: hold lower thirds longer, tighten the pre-answer pause. Name/title treatment approved in round 1 — do not regress.",
    comment_ids: ["comment-charles-1", "comment-charles-2"],
    created_at: T2, updated_at: T3, created_by: BAILEY,
  },
];

export const seedDecisions: Decision[] = [
  {
    id: "dec-ica-logo", project_id: "ica",
    subject: "Ship roadshow master with updated logo animation",
    body: "Client approved v5 with the new logo animation in the close. Any future change is a new scope conversation.",
    decided_by: "morgan@ica.example", source: "review",
    comment_ids: ["comment-denie-3"],
    supersedes_id: null, implementation_status: "done",
    created_at: "2026-03-08T16:20:00.000Z", updated_at: "2026-03-08T16:20:00.000Z", created_by: BAILEY,
  },
];

export const seedDeliverables: Deliverable[] = [
  {
    id: "del-ica-master", project_id: "ica", name: "ICA_ROADSHOW_MASTER_16x9.mov",
    spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9", captions: true, audio: "stereo 48kHz", watermark: false },
    source_version_id: "ver-ica-final-v5", status: "delivered", qc_notes: "QC pass 2026-03-09: captions, loudness -16 LUFS, no dead pixels.",
    delivered_at: "2026-03-09T19:30:00.000Z",
    created_at: T0, updated_at: "2026-03-09T19:30:00.000Z", created_by: BAILEY,
  },
  {
    id: "del-ica-social", project_id: "ica", name: "ICA_ROADSHOW_SOCIAL_9x16.mp4",
    spec: { resolution: "1080x1920", codec: "H.264 12Mbps", aspect: "9:16", captions: true, audio: "stereo 48kHz", watermark: false },
    source_version_id: "ver-ica-final-v5", status: "qc", qc_notes: "Checking caption safe-area on 9:16 reframe.",
    delivered_at: null,
    created_at: T1, updated_at: T3, created_by: BAILEY,
  },
];

/* ------------------------- Transcript segments ------------------------------ */

export interface DemoTranscriptSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string;
  text: string;
}

/**
 * Transcript content backing the transcript-sourced selects. Read-only demo
 * transcript for the podcast asset; selects created from these segments
 * persist through the store with segment provenance.
 */
export const seedTranscriptSegments: Record<string, DemoTranscriptSegment[]> = {
  "mclaren-podcast-v3": [
    { id: "seg-21", start_seconds: 6, end_seconds: 14, speaker: "Dana Whitfield", text: "People ask why a logistics company walked into an EPC partnership. It started with a failed lift plan nobody wants to repeat." },
    { id: "seg-22", start_seconds: 14, end_seconds: 22, speaker: "Dana Whitfield", text: "The short answer is trust. We needed their crews to treat our freight like their own steel, and that took a year of showing up." },
    { id: "seg-88", start_seconds: 40, end_seconds: 52, speaker: "Host", text: "Take me to Nashville. The turnaround that became the case study." },
    { id: "seg-89", start_seconds: 52, end_seconds: 66, speaker: "Dana Whitfield", text: "Nashville was forty trucks, six cranes, and one weekend that could not slip. Everyone knew the number." },
    { id: "seg-90", start_seconds: 66, end_seconds: 78, speaker: "Dana Whitfield", text: "When the last load cleared the gate at 4 a.m., that is when the partnership stopped being a contract." },
    { id: "seg-301", start_seconds: 100, end_seconds: 138, speaker: "Dana Whitfield", text: "What is next is the fleet program: shared telematics, joint safety metrics, and a training pipeline that turns drivers into site leads." },
  ],
};

/* ----------------------- Payments / Notification outbox --------------------- */

export const seedPaymentMilestones: PaymentMilestone[] = [
  {
    id: "pm-ica-deposit", project_id: "ica", proposal_id: "prop-ica-v2",
    kind: "deposit", label: "Deposit (30%) — ICA Roadshow 2026 — Opening Film Package",
    amount_cents: 307650, currency: "USD", status: "paid", method: "manual",
    checkout_url: null, checkout_provider: null, paid_at: "2026-03-05T15:00:00.000Z",
    created_at: "2026-03-01T17:25:00.000Z", updated_at: "2026-03-05T15:00:00.000Z", created_by: BAILEY,
  },
  {
    id: "pm-ica-balance", project_id: "ica", proposal_id: "prop-ica-v2",
    kind: "balance", label: "Balance — ICA Roadshow 2026 — Opening Film Package",
    amount_cents: 717850, currency: "USD", status: "pending", method: null,
    checkout_url: null, checkout_provider: null, paid_at: null,
    created_at: "2026-03-01T17:25:00.000Z", updated_at: "2026-03-01T17:25:00.000Z", created_by: BAILEY,
  },
];

export const seedNotificationOutbox: NotificationOutboxItem[] = [
  {
    id: "no-ica-final-email", project_id: "ica", intent: "review_link",
    channel: "email", recipient: "approvals@ica.example",
    subject: "Final approval: ICA_ROADSHOW_x_FINAL",
    body: "Final approval: ICA_ROADSHOW_x_FINAL\n/review/demo?demo=1&asset=ica-roadshow-final",
    status: "dry_run_sent", provider: "dry-run",
    idempotency_key: "seed-ica-final-email", attempt_count: 1, last_error: null,
    created_at: "2026-07-14T21:58:30.000Z", updated_at: "2026-07-14T21:58:30.000Z", created_by: BAILEY,
  },
  {
    id: "no-ceraweek-sms", project_id: "ica", intent: "review_link",
    channel: "sms", recipient: "+15551234567",
    subject: "CERAWeek speaker cut review",
    body: "CERAWeek speaker cut review\n/review/demo?demo=1&asset=denie-mcdonald-v4",
    status: "pending_provider", provider: null,
    idempotency_key: "seed-ceraweek-sms", attempt_count: 0, last_error: "provider_not_configured",
    created_at: "2026-07-14T20:36:00.000Z", updated_at: "2026-07-14T20:36:00.000Z", created_by: BAILEY,
  },
];

/* ------------------------- El Paso production seed -------------------------- */

export const seedProductionDays: ProductionDay[] = [
  { id: "pd-elpaso-scout", project_id: "el-paso", date: "2026-08-17", call: "09:00", wrap: "14:00", type: "scout", status: "scheduled", notes: "Tech scout: KBH Desalination + Brook Hollow gate access", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "pd-elpaso-d1", project_id: "el-paso", date: "2026-08-18", call: "06:30", wrap: "18:30", type: "principal", status: "scheduled", notes: "Control room interview (Adam) + switchgear. Heat rule 10:00–17:00.", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "pd-elpaso-d2", project_id: "el-paso", date: "2026-08-19", call: "06:00", wrap: "18:00", type: "principal", status: "scheduled", notes: "Weather mast dawn, Gisela interview, Brook Hollow Rockwell frame", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "pd-elpaso-d3", project_id: "el-paso", date: "2026-08-20", call: "06:30", wrap: "17:00", type: "principal", status: "scheduled", notes: "Pickups, glass-at-dawn kitchen, TecH2O", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "pd-elpaso-d4", project_id: "el-paso", date: "2026-08-21", call: null, wrap: null, type: "contingency", status: "scheduled", notes: "Weather/schedule contingency only", created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedCrewMembers: CrewMember[] = [
  { id: "crew-bailey", project_id: "el-paso", name: "Bailey Eubanks", role: "Director / Producer / Interviewer", rate_basis: "flat", days: 4, contact: "(501) 351-5927", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "crew-cesar", project_id: "el-paso", name: "Cesar Berrones", role: "DP (camera, lighting, sound)", rate_basis: "day", days: 4, contact: null, created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "crew-alex", project_id: "el-paso", name: "Alex Addison", role: "Photo / BTS / Stills", rate_basis: "day", days: 3, contact: null, created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedLocations: Location[] = [
  { id: "loc-kbh", project_id: "el-paso", name: "KBH Desalination Plant", address: "El Paso, TX", contact: "Plant operations office", access_window: "Aug 18 06:30–10:00", cleared_to_film: ["exterior process areas", "control room (escorted)"], restricted: ["control screens", "credentials", "IP addresses"], agreement_status: "signed", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "loc-brookhollow", project_id: "el-paso", name: "Brook Hollow", address: "El Paso, TX", contact: "Community liaison", access_window: "Aug 19 afternoon", cleared_to_film: ["street exteriors", "Rockwell cabinet (one frame, approved)"], restricted: ["residents' homes", "license plates"], agreement_status: "sent", created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "loc-weathermast", project_id: "el-paso", name: "Weather station field site", address: "Franklin Mountains area", contact: null, access_window: "Aug 19 dawn", cleared_to_film: ["mast", "landscape"], restricted: [], agreement_status: "none", created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedReleases: Release[] = [
  { id: "rel-adam", project_id: "el-paso", person_name: "Adam Wickersham", type: "appearance", status: "sent", signed_at: null, file_url: null, language: "en", production_day_ids: ["pd-elpaso-d1"], created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "rel-gisela", project_id: "el-paso", person_name: "Gisela Rivas", type: "appearance", status: "signed", signed_at: "2026-07-14T18:22:00.000Z", file_url: null, language: "es", production_day_ids: ["pd-elpaso-d2"], created_at: T3, updated_at: T3, created_by: BAILEY },
  { id: "rel-ephram", project_id: "el-paso", person_name: "Ephram Sims", type: "appearance", status: "unsent", signed_at: null, file_url: null, language: "en", production_day_ids: ["pd-elpaso-d2", "pd-elpaso-d3"], created_at: T3, updated_at: T3, created_by: BAILEY },
];

export const seedCallSheets: CallSheet[] = [];

/* ---------------------------- Discovery seed -------------------------------- */

export const seedDiscoverySessions: DiscoverySession[] = [
  { id: "ds-wendys", inquiry_id: "inq-wendys-finalfour", status: "in_progress", created_at: "2026-07-12T14:20:00.000Z", updated_at: T3, created_by: BAILEY },
];

export const seedDiscoveryAnswers: DiscoveryAnswer[] = [
  { id: "da-wendys-goal", session_id: "ds-wendys", question_id: "goal", raw_text: "Recap the spring tournament activation so the brand team can justify next year's spend.", status: "answered", confidence: "high", stakeholder: null, created_at: "2026-07-12T14:25:00.000Z", updated_at: "2026-07-12T14:25:00.000Z", created_by: BAILEY },
  { id: "da-wendys-audience", session_id: "ds-wendys", question_id: "audience", raw_text: "Internal marketing leadership plus their agency of record.", status: "answered", confidence: "medium", stakeholder: null, created_at: "2026-07-12T14:31:00.000Z", updated_at: "2026-07-12T14:31:00.000Z", created_by: BAILEY },
];
