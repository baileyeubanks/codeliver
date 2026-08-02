/* Planning & Orchestration Cockpit — built from the ontology layer.
   The renderer holds no domain knowledge: objects, phases, relationships and
   counts come from ontology.mjs; every colour and metric from foundation.css. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHASES, OBJECT_TYPES, OBJECT_GLYPH, PROJECTS, FOCUS, NEEDS_YOU, NAV, NAV_ACTIVE,
  phaseById, clientById, projectById, typeById, lineageOf, signalVar,
} from "./ontology.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PHASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));

const realProjects = PROJECTS.filter((p) => p.phase !== "inquiry");
const inquiries = PROJECTS.filter((p) => p.phase === "inquiry");
const oldest = Math.max(...NEEDS_YOU.map((n) => n.days));
const needProjectCount = new Set(NEEDS_YOU.map((n) => n.project)).size;
const started = FOCUS.objects.filter((o) => o.signal !== "none").length;

/* The CVP ribbon mark. The brand gradient is permitted here and nowhere else. */
const MARK = `<svg class="mark" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="Co-VideoPro">
  <defs><linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="var(--gradient-base)"/><stop offset="1" stop-color="var(--sky)"/>
  </linearGradient></defs>
  <rect width="32" height="32" rx="8" fill="url(#ribbon)"/>
  <path d="M9 10.5 L16 22 L23 10.5" fill="none" stroke="#fff" stroke-width="3.4"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 18v2h16v-2"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 3h15z"/><path d="M10 21h4"/></svg>`,
};

/* ----------------------------- pipeline board ---------------------------- */
function laneCells(project) {
  const here = PHASE_INDEX[project.phase];
  const isInquiry = project.phase === "inquiry";
  return PHASES.map((ph, i) => {
    if (i < here) return `<div class="lane"><span class="track"></span></div>`;
    if (i > here) return `<div class="lane"></div>`;
    return `<div class="lane">
        <span class="marker${isInquiry ? " marker-quiet" : ""}">
          <span class="dot" style="background:${signalVar(project.health)}"></span>
          <span class="marker-text">${esc(project.laneStatus)}</span>
        </span>
      </div>`;
  }).join("");
}

const objectGlyphs = (project) => {
  /* An inquiry owns nothing, so it gets no ledger at all — rendering six empty
     slots implied a project record that does not exist yet. */
  if (!Object.keys(project.objects).length) return `<span class="glyph-none">no objects yet</span>`;
  return OBJECT_TYPES.map((t) => {
    const n = project.objects[t.id];
    return n ? `<span class="glyph on">${OBJECT_GLYPH[t.id]}<b>${n}</b></span>`
             : `<span class="glyph">${OBJECT_GLYPH[t.id]}</span>`;
  }).join("");
};

function boardRow(project) {
  const client = clientById(project.client);
  return `<div class="row${project.focused ? " row-focus" : ""}">
      <div class="cell">
        <span class="client-name">${esc(client.short)}</span>
        <span class="client-sub">${esc(client.contact)}</span>
      </div>
      <div class="cell cell-mid"><span class="project-title">${esc(project.title)}</span></div>
      <div class="cell cell-mid cell-objects">${objectGlyphs(project)}</div>
      ${laneCells(project)}
    </div>`;
}

const boardHead = `<div class="row row-head">
    <div class="cell"><span class="col-name">Client</span><span class="col-def">owner + contact</span></div>
    <div class="cell cell-mid"><span class="col-name">Project / Inquiry</span><span class="col-def">the operating record</span></div>
    <div class="cell cell-mid"><span class="col-name">Objects</span><span class="col-def">count owned, in lineage order</span></div>
    ${PHASES.map((p) => `<div class="lane lane-head">
        <span class="col-name">${esc(p.name)}</span>
        <span class="col-def">${esc(p.short)}</span>
      </div>`).join("")}
  </div>`;

const objectKey = OBJECT_TYPES
  .map((t) => `<span class="key-item"><b>${OBJECT_GLYPH[t.id]}</b>${esc(t.name)}</span>`)
  .join('<span class="key-arrow">→</span>');

/* --------------------------- focused project ----------------------------- */
const focusProject = projectById(FOCUS.project);
const focusClient = clientById(focusProject.client);

const objectRows = FOCUS.objects.map((o) => {
  const t = typeById(o.type);
  const from = t.from ? typeById(t.from).name : null;
  return `<div class="obj">
      <span class="obj-node" style="background:${signalVar(o.signal)}"></span>
      <div class="obj-main">
        <div class="obj-line">
          <span class="obj-name">${esc(t.name)}</span>
          <span class="obj-value t-num">${esc(o.value)}</span>
        </div>
        <div class="obj-meta">${esc(o.meta)}</div>
      </div>
      <div class="obj-state">
        <span class="pill"><span class="dot" style="background:${signalVar(o.signal)}"></span>${esc(o.state)}</span>
      </div>
      <div class="obj-when t-num">${esc(o.updated)}</div>
      <div class="obj-rel">
        <span class="rel-phase">${esc(phaseById(t.phase).name)}</span>
        <span class="rel-from">${from ? `from ${esc(from)}` : "origin"}</span>
      </div>
    </div>`;
}).join("");

/* ------------------------------ needs you -------------------------------- */
const needRows = NEEDS_YOU.map((n) => {
  const pr = projectById(n.project);
  const cl = clientById(pr.client);
  const t = typeById(n.object);
  return `<div class="need">
      <span class="need-edge" style="background:${signalVar(n.severity)}"></span>
      <div class="need-body">
        <div class="need-top">
          <span class="need-what">${esc(n.what)}</span>
          <span class="need-days t-num">${n.days}<i>d</i></span>
        </div>
        <div class="need-bottom">
          <span class="need-crumb">${esc(cl.short)} <em>›</em> ${esc(pr.title)} <em>›</em> ${esc(t.name)}</span>
          <span class="need-since t-num">since ${esc(n.since)}</span>
        </div>
      </div>
    </div>`;
}).join("");

const navHtml = NAV.map((g) => `<div class="nav-group">
    <span class="nav-label">${esc(g.group)}</span>
    ${g.items.map((it) => `<span class="nav-item${it === NAV_ACTIVE ? " nav-active" : ""}">${esc(it)}</span>`).join("")}
  </div>`).join("");

/* --------------------------------- page ---------------------------------- */
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Co-VideoPro — Planning &amp; Orchestration</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap">
<link rel="stylesheet" href="./foundation.css">
<style>
  body { width: 1920px; height: 1200px; overflow: hidden; }
  .app { display: grid; grid-template-columns: 224px minmax(0, 1fr); height: 100%; }

  /* ------------------------------ sidebar ------------------------------- */
  .side {
    background: var(--white); border-right: 1px solid var(--line);
    display: flex; flex-direction: column; min-height: 0;
  }
  .side-brand {
    display: flex; align-items: center; gap: 10px;
    height: 64px; padding: 0 var(--s4); border-bottom: 1px solid var(--line);
  }
  .brand-word { display: flex; flex-direction: column; gap: 3px; }
  .brand-name { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; color: var(--ink); }
  .brand-tag {
    font-size: 10px; font-weight: 600; letter-spacing: 0.13em;
    text-transform: uppercase; color: var(--gray-700); line-height: 1;
  }
  .side-nav { padding: var(--s4) var(--s2); display: flex; flex-direction: column; gap: var(--s5); }
  .nav-group { display: flex; flex-direction: column; gap: 2px; }
  .nav-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase;
    color: var(--gray-700); line-height: 1; padding: 0 var(--s2) var(--s2);
  }
  .nav-item {
    display: flex; align-items: center; height: 32px; padding: 0 var(--s2);
    border-radius: var(--r-ctl); font-size: 13px; font-weight: 500; color: var(--gray-700);
  }
  .nav-active { background: var(--sapphire); color: var(--white); font-weight: 600; }
  .side-foot {
    margin-top: auto; display: flex; align-items: center; gap: 10px;
    height: 60px; padding: 0 var(--s4); border-top: 1px solid var(--line);
  }
  .avatar {
    width: 30px; height: 30px; border-radius: var(--pill); flex: none;
    background: var(--ice); color: var(--sapphire);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  }
  .side-who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .who-name { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1; }
  .who-role { font-size: 11px; color: var(--gray-700); line-height: 1; }

  /* ------------------------------- main --------------------------------- */
  .main { display: grid; grid-template-rows: 64px 40px minmax(0, 1fr); min-width: 0; }
  .topbar {
    display: flex; align-items: center; gap: var(--s4);
    padding: 0 var(--s5); background: var(--white); border-bottom: 1px solid var(--line);
  }
  .surface-name { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1; }
  .surface-sub { font-size: 12px; color: var(--gray-700); line-height: 1; }
  .search {
    margin-left: var(--s6); flex: 1; max-width: 420px;
    display: flex; align-items: center; gap: var(--s2);
    height: 32px; padding: 0 var(--s3);
    background: var(--white); border: 1px solid var(--line); border-radius: var(--pill);
  }
  .search svg { width: 17px; height: 17px; color: var(--gray-700); flex: none; }
  .search span { font-size: 13px; color: var(--gray-700); }
  .search kbd {
    margin-left: auto; font-family: var(--font); font-size: 11px; font-weight: 600;
    color: var(--gray-700); background: var(--gray-100);
    border-radius: var(--r-ctl); padding: 2px 6px;
  }
  .topbar-right { margin-left: auto; display: flex; align-items: center; gap: var(--s3); }
  .btn-primary svg { width: 16px; height: 16px; }
  .icon-btn {
    width: 32px; height: 32px; border-radius: var(--r-ctl);
    border: 1px solid var(--line); background: var(--white); color: var(--gray-700);
    display: flex; align-items: center; justify-content: center;
  }
  .icon-btn svg { width: 17px; height: 17px; }

  .crumbbar {
    display: flex; align-items: center; gap: var(--s2);
    padding: 0 var(--s5); border-bottom: 1px solid var(--line); background: var(--canvas);
  }
  .crumbbar span { font-size: 12px; color: var(--gray-700); white-space: nowrap; }
  .crumbbar .sep { color: var(--gray-700); }
  .crumbbar .here { color: var(--ink); font-weight: 600; }

  /* ------------------------------ layout -------------------------------- */
  .content {
    display: grid; grid-template-rows: 466px 570px; gap: var(--s5);
    padding: var(--s5); min-height: 0;
  }
  .split { display: grid; grid-template-columns: 1.6fr 1fr; gap: var(--s5); min-height: 0; }

  /* --------------------------- pipeline board --------------------------- */
  .board { display: flex; flex-direction: column; min-height: 0; }
  .board-body { overflow: hidden; }
  .key { display: flex; align-items: center; gap: 7px; }
  .key-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--gray-700); }
  /* Same shape as the board glyph, in the UNOWNED style — a filled key would
     read as "owned", which is what filling means in the column it explains. */
  .key-item b {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 18px; border-radius: var(--r-ctl);
    background: var(--white); border: 1px solid var(--line);
    font-size: 10px; font-weight: 700; color: var(--ink);
  }
  .key-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.10em;
    text-transform: uppercase; color: var(--ink); margin-right: var(--s1);
  }
  .glyph-none { font-size: 12px; color: var(--gray-700); }
  .key-arrow { font-size: 11px; color: var(--gray-700); }

  .row {
    display: grid;
    grid-template-columns: 128px 308px 228px repeat(5, minmax(0, 1fr));
    align-items: stretch; min-width: 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child { border-bottom: 0; }
  .row-head { height: 56px; }
  .row:not(.row-head) { height: 52px; }
  .cell:first-child { padding-left: var(--s4); }
  .lane:last-child { padding-right: var(--s4); }
  .cell {
    padding-right: var(--s3); min-width: 0;
    display: flex; flex-direction: column; justify-content: center; gap: 5px;
  }
  /* Every column after the first carries the same divider — one table, one rule. */
  .cell-mid, .lane { border-left: 1px solid var(--line); padding-left: var(--s3); }
  .row-head .cell, .row-head .lane { justify-content: flex-end; padding-bottom: 10px; }

  .col-name {
    font-size: 11px; font-weight: 600; letter-spacing: 0.10em;
    text-transform: uppercase; color: var(--ink); line-height: 1;
  }
  .col-def { font-size: 11px; color: var(--gray-700); line-height: 1; white-space: nowrap; }

  .client-name { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.1; }
  .client-sub { font-size: 12px; color: var(--gray-700); line-height: 1.1; }
  .project-title {
    font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Fixed slot width, so the six object columns scan vertically. */
  .cell-objects { flex-direction: row; align-items: center; justify-content: flex-start; gap: var(--s1); }
  .glyph {
    display: inline-flex; align-items: center; justify-content: center; gap: 2px;
    width: 30px; height: 22px; flex: none;
    border: 1px solid var(--line); border-radius: var(--r-ctl);
    font-size: 11px; font-weight: 600; color: var(--gray-700);
    background: transparent; line-height: 1;
  }
  .glyph.on { color: var(--ink); background: var(--gray-100); }
  .glyph b { font-weight: 700; font-variant-numeric: tabular-nums; }

  .lane { display: flex; align-items: center; }
  .lane-head { flex-direction: column; align-items: flex-start; gap: 6px; }
  /* A cleared phase is neutral: it is behind the project, not a signal. */
  .track { width: calc(100% - 14px); height: 2px; border-radius: var(--pill); background: var(--gray-300); }
  /* Blue marks where the project is ACTIVE. The dot inside reports health. */
  .marker {
    display: inline-flex; align-items: center; gap: 6px;
    height: 24px; padding: 0 10px;
    border: 1px solid var(--sapphire); border-radius: var(--pill);
    background: var(--white); max-width: 100%; min-width: 0;
  }
  .marker-text {
    font-size: 12px; font-weight: 500; line-height: 1; color: var(--sapphire);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* An inquiry is not yet a project, so it gets no blue at all. */
  .marker-quiet { border-color: var(--line); }
  .marker-quiet .marker-text { color: var(--gray-700); }
  .row-focus { background: var(--ice); box-shadow: inset 2px 0 0 var(--sapphire); }

  /* ------------------------- focused project ---------------------------- */
  .focus-panel { display: flex; flex-direction: column; min-height: 0; }
  .focus-title { padding: var(--s4) var(--s4) var(--s3); }
  .focus-name { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.018em; color: var(--ink); }
  .focus-owner { margin-top: 6px; font-size: 13px; color: var(--gray-700); line-height: 1.2; }

  .objects { flex: 1; display: flex; flex-direction: column; padding: 0 var(--s4); min-height: 0; }
  .obj, .obj-head {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) 132px 104px 116px;
    align-items: center;
  }
  .obj-head { height: 26px; border-bottom: 1px solid var(--line); flex: none; }
  .obj-head span {
    font-size: 10px; font-weight: 600; letter-spacing: 0.11em;
    text-transform: uppercase; color: var(--gray-700); line-height: 1;
  }
  .obj-head .pad { padding-left: var(--s3); }
  .obj { position: relative; flex: 1; min-height: 0; }
  /* The lineage spine: the rule runs through the centre of every node. */
  .obj::before {
    content: ""; position: absolute; left: 12px; top: 0; bottom: 0;
    width: 1px; background: var(--gray-300);
  }
  .obj-head + .obj::before { top: 50%; }
  .obj:last-child::before { bottom: 50%; }
  .obj-node {
    position: relative; z-index: 1; width: 9px; height: 9px; margin-left: 8px;
    border-radius: var(--pill); box-shadow: 0 0 0 3px var(--white);
  }
  .obj-main { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .obj-line { display: flex; align-items: baseline; gap: var(--s2); min-width: 0; }
  .obj-name { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.1; }
  .obj-value { font-size: 12px; color: var(--gray-700); line-height: 1.1; }
  .obj-meta {
    font-size: 12px; color: var(--gray-700); line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .obj-state { padding-left: var(--s3); }
  .obj-when { font-size: 12px; color: var(--gray-700); padding-left: var(--s3); white-space: nowrap; }
  .obj-rel {
    display: flex; flex-direction: column; gap: 5px;
    padding-left: var(--s3); border-left: 1px solid var(--line);
    align-self: stretch; justify-content: center;
  }
  .rel-phase { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1; }
  .rel-from { font-size: 11px; color: var(--gray-700); line-height: 1; white-space: nowrap; }

  .decision {
    margin: var(--s3) var(--s4);
    padding: var(--s3);
    border: 1px solid var(--line); border-radius: var(--r-ctl);
    background: var(--gray-100); flex: none;
  }
  .decision-title { margin-top: 7px; font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.3; }
  .decision-meta { margin-top: 5px; font-size: 12px; color: var(--gray-700); }
  .slug {
    font-size: 11px; font-weight: 600; color: var(--sapphire);
    background: var(--ice); border-radius: var(--r-ctl); padding: 2px 6px;
  }

  /* ------------------------------ needs you ----------------------------- */
  .needs { display: flex; flex-direction: column; min-height: 0; }
  .needs-body { flex: 1; display: flex; flex-direction: column; padding: 0 var(--s4); min-height: 0; }
  .need { display: flex; gap: var(--s3); flex: 1; min-height: 0; align-items: center; }
  .need + .need { border-top: 1px solid var(--line); }
  .need-edge { width: 3px; height: 36px; border-radius: var(--pill); flex: none; }
  .need-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
  .need-top { display: flex; align-items: baseline; gap: var(--s3); }
  .need-what {
    flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--ink);
    line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* Urgency is carried by the figure, not by an extra colour. */
  .need-days { font-size: 18px; font-weight: 700; color: var(--ink); line-height: 1; flex: none; }
  .need-days i { font-style: normal; font-size: 11px; font-weight: 600; color: var(--gray-700); margin-left: 1px; }
  .need-bottom { display: flex; align-items: baseline; gap: var(--s3); }
  .need-crumb {
    flex: 1; min-width: 0; font-size: 12px; color: var(--gray-700);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .need-crumb em { font-style: normal; color: var(--gray-700); margin: 0 2px; }
  .need-since { font-size: 12px; color: var(--gray-700); flex: none; }
</style></head>
<body>
<div class="app">

  <aside class="side">
    <div class="side-brand">
      ${MARK}
      <span class="brand-word">
        <span class="brand-name">Co-VideoPro</span>
        <span class="brand-tag">Content Co-op</span>
      </span>
    </div>
    <nav class="side-nav">${navHtml}</nav>
    <div class="side-foot">
      <span class="avatar">BE</span>
      <span class="side-who">
        <span class="who-name">Bailey Eubanks</span>
        <span class="who-role">Owner</span>
      </span>
    </div>
  </aside>

  <div class="main">

    <header class="topbar">
      <div style="display:flex;flex-direction:column;gap:6px;">
        <span class="surface-name">Planning &amp; Orchestration</span>
        <span class="surface-sub">All active work, positioned on the pipeline</span>
      </div>
      <div class="search">
        ${ICON.search}<span>Search projects, media, people</span><kbd>⌘K</kbd>
      </div>
      <div class="topbar-right">
        <button class="btn-primary">${ICON.upload}Upload</button>
        <span class="icon-btn">${ICON.bell}</span>
        <span class="avatar">BE</span>
      </div>
    </header>

    <nav class="crumbbar">
      <span>Content Co-op</span><span class="sep">›</span>
      <span>Workspace</span><span class="sep">›</span>
      <span class="here">Planning &amp; Orchestration</span>
    </nav>

    <div class="content">

      <section class="panel board">
        <div class="panel-head">
          <span class="t-micro">Pipeline spine · ${realProjects.length} projects · ${inquiries.length} inquiries</span>
          <span class="key"><span class="key-label">Objects owned</span>${objectKey}</span>
        </div>
        <div class="board-body">
          ${boardHead}
          ${PROJECTS.map(boardRow).join("")}
        </div>
      </section>

      <div class="split">

        <section class="panel focus-panel">
          <div class="panel-head">
            <span class="t-micro">Focused project · ${started} of ${FOCUS.objects.length} object types started</span>
            <span class="t-micro" style="letter-spacing:0.04em;text-transform:none;">Client → Project → Object</span>
          </div>
          <div class="focus-title">
            <div class="focus-name">${esc(focusProject.title)}</div>
            <div class="focus-owner">${esc(focusClient.name)} · ${esc(focusClient.contact)}, ${esc(focusClient.role)}</div>
          </div>
          <div class="objects">
            <div class="obj-head">
              <span></span><span>Object</span>
              <span class="pad">State</span><span class="pad">Updated</span><span class="pad">Phase · from</span>
            </div>
            ${objectRows}
          </div>
          <div class="decision">
            <span class="t-micro">Latest decision</span>
            <div class="decision-title">${esc(FOCUS.decision.title)}</div>
            <div class="decision-meta">
              ${esc(FOCUS.decision.by)} · ${esc(FOCUS.decision.on)} · ${esc(FOCUS.decision.provenance)}
              <span class="slug">${esc(FOCUS.decision.link)}</span>
            </div>
          </div>
          <div class="panel-foot">
            <span class="foot-note">Objects belong to this project and descend in order from the Brief.</span>
          </div>
        </section>

        <section class="panel needs">
          <div class="panel-head">
            <span class="t-micro">Needs you · oldest first</span>
            <span class="t-micro" style="letter-spacing:0.04em;text-transform:none;">Client → Project → Object</span>
          </div>
          <div class="needs-body">${needRows}</div>
          <div class="panel-foot">
            <span class="foot-note">
              ${NEEDS_YOU.length} open loops across ${needProjectCount} projects · oldest ${oldest} days · counted against 01 Aug 2026
            </span>
          </div>
        </section>

      </div>
    </div>
  </div>
</div>
</body></html>`;

writeFileSync(path.join(DIR, "orchestration-cockpit.html"), html);
console.log("built:", path.join(DIR, "orchestration-cockpit.html"));
