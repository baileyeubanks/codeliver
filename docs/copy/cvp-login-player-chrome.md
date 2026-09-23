# CVP copy sheet — login + player chrome

Owner: Hook. Land: Frame (quiet column), Reel (login UI).
This sheet is words only. Do not rename working auth IDs.

## Login

Blaze accepted HOOK-LOGIN-ENGAGEMENT-COPY-01. Both hosts use these strings. Landed in `AuthShell` and `app/login/page.tsx`.

| Slot | Say |
| --- | --- |
| Headline (`#login-title`) | Open the cut that still needs a decision. |
| Sub | Projects, review, and delivery stay here — with Content Co-op, not scattered across inboxes. |
| Badge | Workspace access |
| Process line | Brief → cut → review → handoff |
| Header chip | Content Co-op clients |
| Work email | Work email |
| Password | Password |
| Forgot | Forgot password? |
| Primary CTA | Sign in |
| Secondary | Need an invite? Request access |
| REVIEW | Approve the cut in one place |
| HANDOFF | Brief to delivery, same room |
| SECURE | Sign-in required · stays on this site |
| Foot | Private workspace · Content Co-op clients |

`Request access` uses the existing signup href. No `/pricing` or `/docs`.

Host context labels in `auth-context.ts` stay. The header chip does not read them.

### Auth IDs — do not touch

`#login-title` `#auth-form` `#login-email` `name="email"` `#login-password` `name="password"` `aria-controls="login-password"` `POST /api/auth/login` `next` `demo=1` Google sign-in Forgot-password and signup hrefs.

Visible-name assertions in `tests/e2e/smoke.spec.ts` and `tests/e2e/demo-auth.ts` follow the headline and Work email label. The demo button stays `Open local workspace`. `.accessStrip` stays; the three chips changed words, not layout. Latch owns the handlers.

## Player chrome

Icon first. A word only when the control has no icon, or for the accessible name.

| Control | Name |
| --- | --- |
| Play / pause | Play · Pause |
| Skip | Back · Forward |
| Sound | Mute · Unmute |
| Level | Volume |
| Rate | Speed (face shows `1×`) |
| Loop | Loop · Clear loop |
| Frame | Full screen |
| Seek | Seek |
| Notes | Note |
| Note step | Previous · Next |
| Stage toggle | Focus · Review |
| Empty notes | No notes yet. |

Timecode stays numeric. No caption beside it.

Marker name: `Note, 12.4s`. The sentence stays in the rail, not on the marker.

### Kill on the player

- “Focus player” / “Show review”
- Loop sentences (“Loop A-B set — press again to clear” and the in-point variants)
- “Keyboard seek interval” / “Arrow key seek interval” as visible or title copy
- Review header crumb: Shared review / Source preview / Project /
- Status essays. Face shows one word: Locked, Source, or the existing short state
- “Review details” → Details

Do not rename player store keys, `data-transport-timecode`, comment ids, or review routes.
