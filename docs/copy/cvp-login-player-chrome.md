# CVP copy sheet — login + player chrome

Owner: Hook. Land: Frame (quiet column), Reel (login UI).
This sheet is words only. Do not rename working auth IDs.

## Login

| Slot | Say |
| --- | --- |
| Headline (`#login-title`) | Open the cut that still needs a decision. |
| Submit, idle | Sign in |
| Submit, waiting | Signing in |
| Demo submit | Sign in |

Email. Password. Forgot password? Show password. Hide password.
Footer link: Create an account. Legal: Privacy. Terms.

No subhead. No feature list. No second button.

### Kill

Do not render these. Remove the nodes; do not restyle them into quieter chips.

| Kill | Where it lives now |
| --- | --- |
| Pipeline crumb | `AuthShell` tagline: Brief → shoot → cut → delivery |
| Account pill | Login context row: Account access |
| Portal · Session · Return | `accessReadiness`: Portal, Session, Return |

Also drop from the auth column, same pass: “Video production workspace”, the host security pill, the Demo chip, and “Private account access” / “Demo data stays in this browser”.

### Notices

| Case | Say |
| --- | --- |
| Password updated | Password updated. |
| Bad link | That link expired. |
| 429 | Wait, then try again. |
| Down | Sign-in is down. Try again. |
| Rejected | Email or password was not accepted. |
| Wrong surface | Use the {portal label}. |

`AUTH_PORTALS` labels and origins stay. The notice wraps them. It is not a chip.

### Auth IDs — do not touch

`#login-title` `#auth-form` `#login-email` `name="email"` `#login-password` `name="password"` `aria-controls="login-password"` `POST /api/auth/login` `next` `demo=1` Google sign-in Forgot-password and signup hrefs.

When the headline and demo button land, retarget only the visible-name assertions in `tests/e2e/smoke.spec.ts` and `tests/e2e/demo-auth.ts`. Geometry that requires `.accessStrip` (`tests/admin-client-front-door.test.ts`) updates with the chip removal. Latch owns the handlers.

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
