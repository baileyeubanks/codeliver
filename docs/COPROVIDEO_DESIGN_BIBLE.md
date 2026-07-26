# Co‑ProVideo — Design Bible (governing visual identity)

**Adopted:** 2026-07-17 · **Authority:** user-supplied Co‑ProVideo master spec — supersedes the Webster board system (that name is retired; the product is **co-videopro, styled Co‑ProVideo**, by Content Co-op). This file registers the governing tokens and the adoption tranches; the full user spec text is the reference of record.

## Positioning

A premium Content Co-op film-production universe: cinematic, editorial, tactile, luxurious, precise, spacious, calm. Not a dashboard — a living production environment: part independent film journal, part private client screening room, part creative archive, part studio command center.

## Material tokens (the palette)

| Token | Value | Role |
|---|---|---|
| `--graphite` | #121417 | foundations (page ground) |
| `--charcoal` | #1a1d21 | surfaces |
| `--charcoal-2` | #22262b | raised surfaces |
| `--ivory` | #f2ede2 | primary typography (warm) |
| `--ivory-dim` | #b8b2a4 | secondary typography |
| `--stone` | #2a2e34 | soft stone panels |
| `--midnight` | #0a0d12 | video wells |
| `--cobalt` | #4a7dff | restrained signals / primary action |
| `--sage` | #7fa88c | success / approval (dusty) |
| `--amber-cp` | #c98a3d | attention (burnt amber) |
| `--crimson` | #a14a4a | risk / destructive (muted) |
| `--hairline-cp` | rgba(242, 237, 226, 0.09) | low-contrast dividers |
| `--chrome-edge` | rgba(242, 237, 226, 0.14) | thin chrome borders |

Atmosphere: film grain, subtle bloom, rich shadows, refined translucency (smoked glass), brushed-metal details. Typography: Inter Medium 500 (UI) + monumental display scale. Frames: 16:9 media, 24px corners on large cards, thin chrome borders, delicate hover light. Motion: slow editorial fades, cross-dissolves, low-amplitude drift, quiet bloom — never bouncy/elastic/frantic.

## Surface inventory (tranche plan)

- **Public:** Studio Home (showreel opening — replaces /welcome concept), Work, Case Study, Services, Studio/About, Start a Project.
- **Client world:** Client Home, Project Overview, Creative Brief (living editorial doc), Production Calendar, Video Review Theater, Approval Moment, Asset Library, Request Center, Reporting.
- **Internal studio:** Command Center, Project Pipeline, Project Workspace, Producer, Editorial, Client Intelligence, Financial Studio, Templates, Settings/Brand Atmosphere.
- Lifecycle language: Discovery, Direction, Pre-production, Production, Editorial, Review, Refinement, Approval, Delivery, Momentum.

## Fidelity requirements (binding on every shipped surface)

1. Surface-detail: 30 specific design comments per surface (mood, temperature, materials, accent roles, type scale/weight, crops, grid, margins, card personality, borders, shadows, corners, layering, nav, header, pacing, hierarchy, density, states ×6, responsive ×3, final impression).
2. Button-detail: 10 visual-state comments per interactive element (rest/hover/pressed/focus/border/shadow/icon/label/motion/disabled). Primary = warm ivory or restrained cobalt; secondary = glassy charcoal; destructive = muted crimson; approval = dusty sage, ceremonial.
3. Motion-detail: 20 motion comments per transition class (purpose, mood, pace, duration, easing, entry/exit, opacity/scale/depth/blur/shadow/image/type/icon/layer, hover/focus/completion, reduced-motion). No bouncy, elastic, frantic, or loud movement.

These live in code as review checklists per surface tranche (see `docs/design-evidence/` and the surface QA notes in the upgrade log).

## Adoption tranches

1. **Foundation (this commit):** tokens, fonts, lockup (CVP monogram + Co‑ProVideo wordmark), name revert from Webster, graphite base theme variables.
2. **Studio Home:** full-bleed showreel hero (public front door) — grain, overlay, monumental type, quiet invitations.
3. **Dark theme migration:** app surfaces move from light-admin to graphite editorial (cockpit already dark-adjacent; shell/home/projects follow).
4. **Review Theater refinement:** the screening-room treatment of the existing review surface.
5. **Client world tranche:** Client Home → Review Theater → Approval Moment.
6. **Remaining public worlds:** Work/Case Study/Services/Studio/Start-a-Project.
