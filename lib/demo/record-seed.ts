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
  Contact,
  Decision,
  Deliverable,
  Inquiry,
  Organization,
  PlanItem,
  Proposal,
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
  { id: "sel-pod-1", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 96, out_seconds: 141, label: "Why the partnership started", source: "transcript", transcript_segment_ids: ["seg-21", "seg-22"], created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "sel-pod-2", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 402, out_seconds: 455, label: "The Nashville turnaround story", source: "transcript", transcript_segment_ids: ["seg-88", "seg-89", "seg-90"], created_at: T2, updated_at: T2, created_by: BAILEY },
  { id: "sel-pod-3", project_id: "schneider-epc", asset_id: "mclaren-podcast-v3", version_id: null, in_seconds: 1188, out_seconds: 1246, label: "What's next for the fleet program", source: "transcript", transcript_segment_ids: ["seg-301"], created_at: T2, updated_at: T2, created_by: BAILEY },
];

export const seedSequences: Sequence[] = [
  { id: "seq-pod-radio-cut", project_id: "schneider-epc", name: "McLaren Podcast — radio cut", version: 1, status: "draft", fps: 24, created_from: "transcript-assembly", created_at: T2, updated_at: T3, created_by: BAILEY },
];

export const seedSequenceClips: SequenceClip[] = [
  { id: "clip-pod-1", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-1", track_index: 0, timeline_in_seconds: 0, timeline_out_seconds: 45, source_in_seconds: 96, source_out_seconds: 141 },
  { id: "clip-pod-2", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-2", track_index: 0, timeline_in_seconds: 45, timeline_out_seconds: 98, source_in_seconds: 402, source_out_seconds: 455 },
  { id: "clip-pod-3", sequence_id: "seq-pod-radio-cut", asset_id: "mclaren-podcast-v3", version_id: null, select_id: "sel-pod-3", track_index: 0, timeline_in_seconds: 98, timeline_out_seconds: 156, source_in_seconds: 1188, source_out_seconds: 1246 },
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
