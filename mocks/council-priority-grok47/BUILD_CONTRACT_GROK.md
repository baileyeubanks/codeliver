# BUILD CONTRACT — Grok 4.7

## 1. Record contract

| Object | Seat | Lives today | State rule | This plan |
| --- | --- | --- | --- | --- |
| Tenant | Projects | `co_production.organizations`; hosts in `lib/auth/host-surface.ts` are `admin.contentco-op.com`, `client.contentco-op.com`, `co-videopro.com` | One tenant per `{client}`. Session stays on that host. Client A never reads client B | New: `{client}.co-videopro.com` resolves the tenant. Schneider is the first door. `client.contentco-op.com` stays until that door Lands. Guest links already sent keep working |
| Project | Projects | `co_production.projects` (`stage`, `organization_id`) | One job. Login opens the list | Reuse. El Paso Water is the first row on Schneider |
| Brief | Brief | `co_production.briefs`, `co_production.brief_versions` | `draft` → `in_review` → `approved` → `superseded` | Reuse. Disk folder is the source of the words |
| Shoot day | Shoot | `co_production.production_days` | `scheduled` → `in_progress` → `wrapped` / `cancelled` | Reuse. Days, locations, shots. No crew row on the seat |
| Location | Shoot | `co_production.locations` | `agreement_status`: `none` → `drafted` → `sent` → `signed` | Reuse |
| Shot | Shoot | `co_production.shots` | `planned` → `covered` / `dropped` | Reuse |
| Asset | Cut, Library | `co_production.assets` (`nas_path`) | File identity. `nas_path` points at the disk folder | Reuse. Path is the CCO Mac folder, not a second library |
| Version | Cut | `co_production.versions` | Exact version. Comments and approvals bind to it (`20260922073000_version_bound_approval_rounds.sql`) | Reuse |
| Comment | Cut | `co_production.comments` | Tap on the film writes time + pin on that version | Reuse. Opened from the tap. No under-deck |
| Share | Cut | `co_production.review_invites`; intent still derived in `lib/sharing/share-intent.ts` | Review / Approve / Preview stored on the share | Row 6 ports VA-018. This plan does not rebuild it |
| Review outcome | Cut | Version-bound approval rounds | Finish writes `finished` / `approved` / `changes requested` on that version | Derived. Nobody retypes it |
| Deliverable | Delivery | `co_production.deliverables` (`specced` `encoding` `qc` `ready` `delivered` `expired`) | Fixed record: approved version → delivered. Nothing sent without the operator’s yes | Reuse the row. AI drafts are QC against the approved brief, and a chase list of open comments. Operator accepts or ignores. The draft never sends, spends, or approves |
| Commercial | — | `cco_estimate_id`, `commercial_total_cents` on `co_production.projects` (`20260812000000_commercial_handoff_fields.sql`) | CCO OS writes them. CVP does not mutate them | Show on the master. No finance seat |
| Crew | — | `co_production.crew_members` exists | No crew product | Not a seat. Not a door. Not a state machine |

## 2. Two-side map

| Screen | Side | Scope | Reads | Writes | Phone | Desktop |
| --- | --- | --- | --- | --- | --- | --- |
| Login | Both | Door host | Host → tenant | Session | Door, then Projects | Door, then Projects |
| Projects | Client | One tenant | That tenant’s projects | Open one project | Bottom: Projects | Hub list |
| Projects | Master | All A-list tenants | Every tenant’s projects + derived “waiting on whom” | Open a job; the job opens on `{client}.co-videopro.com` | Same list, operator scope | Same list, operator scope |
| Brief | Both | One project | `briefs` for that project | Brief version | Bottom: Brief | Step row |
| Shoot | Master | One project | `production_days`, `locations`, `shots` | Day / shot status | Bottom: Shoot | Step row |
| Shoot | Client | One project | Derived day progress | None | Step shows progress | Step shows progress |
| Cut | Client | One project | Current version | Tap writes a comment on that version | Film only. Rail hidden. Composer from the tap | Film only. No side rail |
| Cut | Master | One project | Same version + share | Stores Review / Approve / Preview on the share. Finish writes the review outcome | Same film | Same film |
| Delivery | Both | One deliverable | `deliverables` + approved version + brief + open comments | Operator accepts or ignores the QC draft and the chase list, then sets delivered | Bottom: Delivery | Step row |
| Library | Client | One tenant | That tenant’s assets | None on open | Drawer | Thin left |
| Library | Master | All tenants | Assets across tenants, still keyed by project | None on open | Drawer | Thin left |
| Guest link | Neither door | One version | The shared version | Comment if the share allows | Film. Rail hidden | Film. Rail hidden |

## 3. El Paso seat fill

| Seat | Record | Disk | Client sees | Master sees | Write |
| --- | --- | --- | --- | --- | --- |
| Projects | Schneider project “El Paso Water” | CCO Mac `schneider-electric/el-paso-customer-story` | That one job on the Schneider list | The job inside the cross-tenant list | Open |
| Brief | `co_production.briefs` for that project | Brief files in that folder | Approved brief | Draft and approved | New brief version |
| Shoot | Days, locations, shots | Shoot media and notes in that folder | Progress only | Days, locations, shots | Day and shot status |
| Cut | Asset + version of the customer-story film | Picture in that folder. `assets.nas_path` points here | Film. Tap to comment. No rail | Same film. Share posture. Finish | Comment; review outcome on the version |
| Delivery | `co_production.deliverables` bound to the approved version | Delivery files land in that folder | Standing state | Accept or ignore an AI draft, then mark delivered | `delivered` only after yes |
| Library | Assets with `project_id` = El Paso | The same folder, not a second copy | Schneider media only | El Paso among other tenants | None |

## 4. WEFTEC delta

| | El Paso Water | WEFTEC |
| --- | --- | --- |
| Order | First fill | After El Paso seats prove |
| Tenant / door | Schneider / `schneider.co-videopro.com` | Same |
| Disk | CCO Mac `schneider-electric/el-paso-customer-story` | CCO Mac `schneider-electric/weftec` |
| Projects row | First Schneider row | Second Schneider row |
| Brief / Shoot / Cut / Delivery | Filled from the El Paso folder | Same seats, other folder |
| Library | Same drawer, filtered by project | Same drawer, second project |
| Status columns | Madeline, else derived | Jennifer if her sheet is in, else open |
| New tables | None | None |
| Nav | Approved PNGs | Same PNGs |

## 5. Variability

| Case | Input | What may change | What stays |
| --- | --- | --- | --- |
| Madeline | Her sheet for the one live client (row 5) | Column name, who changes the cell, what done means | Derived from version + review outcome |
| Jennifer | Second named sheet, same rule as Madeline | Column vocabulary only | Same deliverable row. If her sheet is not in, this case is open |
| Open | No sheet yet | Nothing | Status stays the review outcome. Empty columns are not invented |

## 6. Land-ready cut list after 1–6

| Role | Rule |
| --- | --- |
| Grok | This cut list |
| Fable | Forges the master |
| This change | No Land |
| ACS #9, #11 | Sibling train. Not cuts here |

| # | ID | Cut | Touch | Proof text | Negative | Preflight |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | CVP-06 | `{client}.co-videopro.com` resolves one organization. Schneider’s door logs in to `/projects`. First row is El Paso Water. | `lib/auth/host-surface.ts`, `proxy.ts` | Phone on `schneider.co-videopro.com`: Schneider mark, El Paso Water, no other tenant. | A second tenant’s project is not on that list. A guest link already sent still paints the film. | After #3 picked and #6 proved. On top of `46a256f2`. DNS is the existing gate, not this cut. `client.contentco-op.com` stays until this passes. |
| 8 | CVP-03 | El Paso deliverable status is derived from that version’s review outcome. Madeline’s columns, when row 5 is in, are labels on that outcome. | `co_production.deliverables` read path, project Delivery seat | El Paso row shows the outcome from Finish. Madeline does not retype it. | With no sheet, the row still shows the outcome. No empty invented column. | After #6. #5 does not block. |
| 10 | CVP-04 | Master Login → Projects across tenants. “Waiting on whom” reads #8. Shell matches the approved nav PNGs. Film hides the pipeline rail. | `components/navigation/navigation-model.ts`, `components/navigation/WorkspaceNavigation.tsx` | Master phone: Projects list, El Paso shows who it waits on, bottom is Projects · Brief · Shoot · Cut · Delivery, Library is the drawer. Desktop thin left. | No second nav. No left rail plus bottom bar. No crew item. Player chrome on `46a256f2` unchanged. | After #7 and #8. Copy PR #30 / #31 / #32. Do not redraw. |
| 12 | CVP-07 | El Paso version change stays on the same film. Notes stay on the version they were tapped on. | Review version binding already in `20260922073000_version_bound_approval_rounds.sql`; player version switch only | Switch version on the El Paso film. The note from the previous version is not on the new one. | No rail beside the film. Overlay and sapphire mark unchanged. | After #6 and #8. |
| 13 | CVP-05 | Master job shows the frozen CCO total. CVP does not write it. | Read `commercial_total_cents` / `commercial_ref` on `co_production.projects` | El Paso on the master shows the handed-off total. | No CVP write to those columns. No invoice send. | After a finished review. “Bailey says bill” stays the existing gate. |
| 14 | CVP-08 | Two drafts on El Paso Delivery: QC against the approved brief, and a chase list of open comments. Operator accepts or ignores each. | Delivery seat only. Reads `briefs`, the current version, open `comments` | Each draft is a card on Delivery. Accept and ignore both leave the deliverable status unchanged until the operator sets delivered. | The card does not send, spend, or approve. No chatbot drawer. | After #6 and one finished El Paso round. |
| 15 | CVP-09 | Second Schneider project, WEFTEC, same seats, same door. Disk `schneider-electric/weftec` on the CCO Mac. | No new table. Second `projects` row under the Schneider organization. `assets.nas_path` points at that folder. | `schneider.co-videopro.com` lists El Paso Water and WEFTEC. WEFTEC Brief / Shoot / Cut / Delivery read that folder. | No new seat, door, or table. Jennifer’s columns, if absent, stay the open case. | After #7, #8, #12, and #14 on El Paso. |

## 7. Kill / don’t-break

| Kill | Don’t-break |
| --- | --- |
| Crew surface, van app, crew states | PR #36 (`bc-ec6df537`) is the only tap-comment Land |
| Rigid delivery ceremony (fixed QC → encode → package gates) | ACS delete tip `c58816e4`: Latch, then Clip. No new delete code unless proof fails |
| Under-film compose deck | Player tip `46a256f2`: overlay ~6%, sapphire mark |
| Pipeline rail on the film | `compress:false` |
| Second player, chatbot drawer | Quiet auth door (`c9804e1`, `5da6aed`) |
| Hand-typed status board | Guest and signed-in client both paint the film (F1) |
| Redraw of the approved nav PNGs | PR #25 stays frozen until row 6 ports VA-018 |
| Landing PR #25 as-is | PR #27 stays behind #36 |
| Landing PR #27 ahead of #36 | Wipster hosting |
| Demo title “Physical Edge — El Paso” as the live job name | CCO OS commercial fields. CVP does not mutate them |
| `crew_members` as a product surface | Guest review links already sent |

## 8. Out of scope

| Out | Why |
| --- | --- |
| Rows 1–6 | Already in flight or proof. This contract starts at 7 |
| Landing any cut in this change | #7–#15 are the list. Fable forges. No Land from this file |
| ACS dispatch, close-out, booking | Sibling train. VA-106 stays an admin load |
| Caio’s Continuity phone rail | Field truth stays voice. No crew product |
| DNS edit, migration apply | Existing Bailey gates. Named, not re-asked |
| Invoice send, phone CS bot, outbound drafts | Nothing sends itself |
| Sandcastles chatbot, drawing suite, transcript NLE | Not a seat |
| Wipster hosting cutover | Stays |
| Player, overlay, logo, auth redo | PASS on `46a256f2` |
| Amanda enrich | Held |
| A question back to Bailey | Locks are closed |
