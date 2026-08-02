/* ==========================================================================
   Co-VideoPro — Ontology layer (the shared object model)
   Canon: docs/CO_VIDEOPRO_CANON.md §1.

   Both apps render windows onto THIS model. Surfaces select from it; they do
   not invent objects, phases or relationships.

     Client → Project → { Brief → Proposal → Assets → Sequences → Reviews → Delivery }
     Spine:  Inquiry → Plan → Produce → Review → Deliver

   Phase is NAMED, never coloured. Colour reports health, not position:
   green = complete, blue = active, amber = pending/in review, red = blocker.

   Sample records follow the repository demo seed (lib/demo/record-seed.ts,
   lib/demo/workspace.ts) — same clients, projects, contacts, versions, amounts
   and due dates. Day counts are read against 2026-08-01.
   ========================================================================== */

/** Health / progress signals. The ONLY colour vocabulary in the product. */
export const SIGNALS = {
  complete: { token: "green",    label: "Complete"    },
  active:   { token: "sapphire", label: "Active"      },
  pending:  { token: "amber",    label: "Pending"     },
  blocked:  { token: "red",      label: "Blocked"     },
  none:     { token: "gray",     label: "Not started" },
};

/** Five stops. Inquiry carries no signal colour at all — an inquiry is not yet
 *  a project, and the absence is the meaning. */
export const PHASES = [
  { id: "inquiry", name: "Inquiry", short: "not yet a project" },
  { id: "plan",    name: "Plan",    short: "brief + proposal" },
  { id: "produce", name: "Produce", short: "capture + assembly" },
  { id: "review",  name: "Review",  short: "with the client" },
  { id: "deliver", name: "Deliver", short: "QC + masters out" },
];

/** `phase` belongs to the object TYPE, so an object's position is decided once
 *  and never at a call site. `from` IS the lineage — the UI reads it. */
export const OBJECT_TYPES = [
  { id: "brief",     name: "Brief",     from: null,        of: "Project", phase: "plan" },
  { id: "proposal",  name: "Proposal",  from: "brief",     of: "Project", phase: "plan" },
  { id: "assets",    name: "Assets",    from: "proposal",  of: "Project", phase: "produce" },
  { id: "sequences", name: "Sequences", from: "assets",    of: "Project", phase: "produce" },
  { id: "reviews",   name: "Reviews",   from: "sequences", of: "Project", phase: "review" },
  { id: "delivery",  name: "Delivery",  from: "reviews",   of: "Project", phase: "deliver" },
];

export const OBJECT_GLYPH = {
  brief: "B", proposal: "P", assets: "A", sequences: "S", reviews: "R", delivery: "D",
};

export const CLIENTS = [
  { id: "ica",       name: "Industrial Contractors Association", short: "ICA",
    contact: "Morgan Lee", role: "Director of Communications" },
  { id: "schneider", name: "Schneider National", short: "Schneider",
    contact: "Dana Whitfield", role: "Brand Content Lead" },
  { id: "bp",        name: "bp", short: "bp",
    contact: "Rachel Osei", role: "External Affairs" },
  { id: "conexon",   name: "Conexon", short: "Conexon",
    contact: "Sam Delgado", role: "Marketing Director" },
  { id: "hlsr",      name: "Houston Livestock Show and Rodeo", short: "HLSR",
    contact: "Priya Natarajan", role: "Media Relations" },
  { id: "wendys",    name: "Wendy’s", short: "Wendy’s",
    contact: "—", role: "No contact yet" },
];

/** `objects` counts OBJECTS, not versions — a brief at v2 is one brief. `laneStatus` is the one fact
 *  belonging to the phase it stands in. `health` is an RGY signal, never a
 *  restatement of the phase. */
export const PROJECTS = [
  { id: "hlsr-2027", client: "hlsr", phase: "inquiry", health: "none",
    title: "2027 Season Coverage", laneStatus: "Inbound 29 Jul", objects: {} },
  { id: "wendys-ff", client: "wendys", phase: "inquiry", health: "none",
    title: "Final Four Activation", laneStatus: "Inbound 31 Jul", objects: {} },
  { id: "conexon", client: "conexon", phase: "plan", health: "blocked",
    title: "Customer-Story Film", laneStatus: "Brief v2 · Proposal v1",
    objects: { brief: 1, proposal: 1 } },
  { id: "el-paso", client: "schneider", phase: "plan", health: "pending",
    title: "Physical Edge — El Paso", laneStatus: "Brief v1 · unapproved",
    objects: { brief: 1 } },
  { id: "bp", client: "bp", phase: "produce", health: "pending",
    title: "Rodeo Recap", laneStatus: "Rough cut v1 overdue",
    objects: { brief: 1, proposal: 1, assets: 1, sequences: 1 } },
  { id: "ica", client: "ica", phase: "review", health: "pending", focused: true,
    title: "Roadshow 2026 — Opening Film Package", laneStatus: "Round 2 · 1 of 2 decided",
    objects: { brief: 1, proposal: 1, assets: 4, sequences: 1, reviews: 2 } },
  { id: "schneider", client: "schneider", phase: "deliver", health: "blocked",
    title: "EPC Recap", laneStatus: "QC 1 of 3 specs",
    objects: { brief: 1, proposal: 1, assets: 2, sequences: 1, reviews: 1, delivery: 3 } },
];

/** The focused project, expanded. `updated` runs monotonically down the
 *  lineage: an object cannot be touched before the one it descends from. */
export const FOCUS = {
  project: "ica",
  objects: [
    { type: "brief", signal: "complete", state: "Approved", value: "v1", updated: "12 Jul 2026",
      meta: "Approved by Morgan Lee · 4 sections · locked" },
    { type: "proposal", signal: "complete", state: "Approved", value: "v2", updated: "14 Jul 2026",
      meta: "$10,255.00 inherited from CCO OS · 30% deposit invoiced" },
    /* Assets are a Produce object, so their state is a Produce state. Reusing
       "In review" here would collide with the Reviews object below. */
    { type: "assets", signal: "active", state: "Ingested", value: "4 files", updated: "18 Jul 2026",
      meta: "3 carry open notes · 1 approved · proxies built" },
    { type: "sequences", signal: "active", state: "Draft", value: "1 cut", updated: "22 Jul 2026",
      meta: "Roadshow master · 60s · EDL exported" },
    { type: "reviews", signal: "pending", state: "In review", value: "2 links", updated: "31 Jul 2026",
      meta: "1 of 2 decisions recorded · 11 notes · round 2 open" },
    /* The project stands at Review, so Delivery has not begun. Nothing on the
       board may imply otherwise. */
    { type: "delivery", signal: "none", state: "Not started", value: "0 of 3", updated: "—",
      meta: "Specs drafted with the proposal · freeze on final approval" },
  ],
  decision: {
    title: "Approve lower-third treatment for the roadshow master",
    by: "Morgan Lee", on: "24 Jul 2026",
    provenance: "2 linked comments · review link",
    link: "ica-roadshow-round-2",
  },
};

/** Oldest debt first. A row may only name an object its project owns, and a
 *  brief's debt must predate its proposal's, because a proposal descends from
 *  a brief. `severity` is data, not a threshold guessed at render time. */
export const NEEDS_YOU = [
  { project: "conexon", object: "brief", severity: "blocked",
    what: "Brief v2 approval overdue", who: "Sam Delgado", days: 23, since: "09 Jul 2026" },
  { project: "schneider", object: "delivery", severity: "blocked",
    what: "QC waiting on 9:16 cutdown", who: "Bailey Eubanks", days: 18, since: "14 Jul 2026" },
  { project: "conexon", object: "proposal", severity: "pending",
    what: "Proposal v1 unanswered", who: "Sam Delgado", days: 17, since: "15 Jul 2026" },
  { project: "ica", object: "reviews", severity: "pending",
    what: "Revision round 2 still open", who: "Edit", days: 16, since: "16 Jul 2026" },
  { project: "bp", object: "sequences", severity: "pending",
    what: "Rough cut to Rachel overdue", who: "Edit", days: 8, since: "24 Jul 2026" },
  { project: "el-paso", object: "brief", severity: "pending",
    what: "Brief unapproved before pre-pro lock", who: "Dana Whitfield", days: 3, since: "29 Jul 2026" },
];

/** Left sidebar, grouped per canon §2.5. */
export const NAV = [
  { group: "Workspace", items: ["Overview", "Planning", "Projects", "Opportunities", "Requests", "Reviews"] },
  { group: "Production", items: ["Field", "Sequences", "Delivery"] },
  { group: "Library", items: ["Media library", "Templates"] },
  { group: "Admin", items: ["Archive", "Settings"] },
];
export const NAV_ACTIVE = "Planning";

/* ------------------------------- helpers -------------------------------- */
export const phaseById   = (id) => PHASES.find((p) => p.id === id);
export const clientById  = (id) => CLIENTS.find((c) => c.id === id);
export const projectById = (id) => PROJECTS.find((p) => p.id === id);
export const typeById    = (id) => OBJECT_TYPES.find((t) => t.id === id);
export const signalVar   = (key) => {
  const token = SIGNALS[key]?.token ?? "gray";
  return token === "gray" ? "var(--gray-500)" : `var(--${token})`;
};

/** Human-readable lineage for an object type, straight from the model. */
export function lineageOf(typeId) {
  const chain = [];
  let cur = typeById(typeId);
  while (cur) { chain.unshift(cur.name); cur = cur.from ? typeById(cur.from) : null; }
  return chain;
}
