"use client";

import { sourceCatalog } from "@/lib/demo/source-catalog";

export default function ProjectSourceArchive({projectId}: {projectId: string}) {
  const project = sourceCatalog?.projects.find((record) => record.id === projectId);
  if (!project) return null;
  const contacts = sourceCatalog?.contacts?.filter((person) => person.project_ids.includes(projectId)) ?? [];
  const notes = sourceCatalog?.review_notes?.filter((note) => note.project_id === projectId) ?? [];
  return <details className="cockpit-panel" style={{padding:16, marginBottom:16}}>
    <summary style={{cursor:"pointer",fontWeight:600}}>Project archive · {contacts.length} people · {notes.length} historical notes</summary>
    <p style={{marginTop:16}}>{project.summary}</p>
    <small>{project.source_label}</small>
    {contacts.length ? <p>{contacts.map((person) => `${person.name} — ${person.documented_role}`).join(" · ")}</p> : null}
    {notes.length ? <>
      <p style={{marginTop:16}}>These notes refer to the named historical cuts. They have not been reassigned to the file currently playing.</p>
      {notes.map((note) => <article key={note.id} style={{padding:"12px 0",borderTop:"1px solid var(--border)"}}>
        <strong>{note.reviewer}{note.timecode ? ` · ${note.timecode}` : ""}</strong>
        <p>{note.note}</p>
        <small>{note.media_title} · {note.status_at_source}<br />{note.source_label}</small>
      </article>)}
    </> : null}
  </details>;
}
