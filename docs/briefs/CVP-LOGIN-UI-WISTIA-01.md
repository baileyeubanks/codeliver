# CVP-LOGIN-UI-WISTIA-01 — Quiet auth column

**Do not build the CVP door from this file.** Locked split: login is ACS, spec [FRAME_CVP_LOGIN_ACS_SOT_20260923](./FRAME_CVP_LOGIN_ACS_SOT_20260923.md). Do not apply the Wistia marketing login or `app.wistia.com/session/new` to `AuthShell`. The notes below are a Wistia session capture only.

**Seat:** Frame (research). **Build:** Reel. **Grade:** Cut.
**SoT:** [app.wistia.com/session/new](https://app.wistia.com/session/new), fetched 2026-09-23 (HTML + `authRedesign` CSS).
**CVP door:** `app/login/page.tsx` inside `components/auth/AuthShell.tsx`. Hosts: `co-videopro.com/login`, `client.contentco-op.com/login`. Same column on both.
**Locked copy:** headline `Open the cut that still needs a decision.` Button `Sign in`.

This brief does not change auth behavior. Latch owns sessions, Google, forgot-password, surface mismatch, and the password-clear on failure. Reel only changes what the column says and what it refuses to say.

## What the Wistia page actually is

The live page is one column. The markup still includes `<aside class="AuthFormSidebar AuthFormMarketingContent">` (an iframe of a navy webinar ad). The redesign CSS turns that off:

- `.AuthFormMarketingContent { display: none !important; }`
- A later `.AuthFormContainer` rule is `display: flex; flex-direction: column`, which replaces the earlier `2fr / 1fr` grid.

What remains on screen, top to bottom:

1. Wordmark, centered, links home. No nav. `.MinimalHeader` is empty.
2. Three outline pills: Sign in with Google, Sign in with Microsoft, Sign in with SSO.
3. A centered secondary “or”.
4. Email label + field. Password label + field. On the password block: Remember me, and Forgot password? as a text link.
5. One solid pill: **Sign in**.
6. One footer line: Don’t have a Wistia account? Sign up.

Document `<title>` is “Sign in to your Wistia account”. There is no on-page H1, no eyebrow, no feature list, no trust chips.

Tokens worth copying as behavior, not as their hex:

- Pills are fully rounded (`--wui-border-radius-rounded: 1000px`). Solid fill is their blue `#2949e5`. Outline buttons are transparent with a 2px inset border.
- Inputs are full width, 16px radius, light surface, a real `<label>` above the field, focus ring 2px. Labels are sentence case, not tracked small-caps.
- Column cap is `.AuthForm-redesign { max-width: 464px; margin: 0 auto; }`.
- Page ground is white / near-white. No clip-path card, no gradient stage, no numbered manifesto.

## What CVP copies

Copy the refusal. The column is a door, not a trailer.

- One centered mark. Use the existing CVP blue long artwork once. Do not stack a second monogram under the header.
- One headline, the Hook line, and nothing above it. No “Access”, no “Account access”, no “Video production workspace”.
- One primary button whose visible label is `Sign in`. No leading icon. Loading may read `Signing in…`. Demo uses the same `Sign in`. Drop `Open local workspace`.
- Email, password, show/hide (icon only, the control we already have), Forgot password? when not in demo.
- Google stays, because it already signs people in. One outline pill, then a centered “or”, then the fields. Do not add Microsoft or SSO to rhyme with Wistia.
- Alerts stay: bad password, expired link, surface mismatch, “password updated”. Those are state. They are not chips.
- Footer economy: one quiet line toward create-account, plus Privacy and Terms as links. No sales sentence.
- Ground `#f7f9fc`, ink from the current auth tokens, action `#0057ff`. CVP sapphire, not Wistia `#2949e5`.
- Width about 456–464px, centered. Unboxed column. A flat white panel is allowed only if it has no shadow theater, no top accent bar, no clip-path.
- 390px mobile is the same column. Nothing wraps into a second story.

Remember me: Wistia has the checkbox because their session form posts `remember_me`. Add it here only if Latch already honors that flag. A checkbox that does nothing is a feature word.

## What comes off this door

Current `AuthShell` and `app/login/page.tsx` still narrate the product. Remove these, in this order:

| Kill | Where it lives now |
|---|---|
| Host security chip (icon + portal name) in the top bar | `AuthShell` `.securityStatus` |
| Second mark plus `Brief → shoot → cut → delivery` | `AuthShell` `.brandHero` / `.tagline` |
| “Account access” pill, and the Demo pill’s job as a feature badge | `login/page.tsx` `.contextRow` |
| H1 “Sign in to Co‑VideoPro” and “Review and approve work with Content Co-op.” | `login/page.tsx` `.heading` |
| Portal / Session / Return strip | `AuthShell` `.accessStrip` (`accessReadiness`) |
| “Private account access” / “Demo data stays in this browser” | `AuthShell` `.assurance` |
| `LogIn` icon inside the submit button | `login/page.tsx` submit |

Demo may keep a single plain word, `Demo`, if an operator must see the mode. It does not get a pipeline, a shield, or a readiness strip.

`packages/ui/src/product-login-shell.tsx` is not mounted by the app. Leave it unwired. Its left column — eyebrow, giant product name, manifesto, and `01 / 02 / 03` feature lines — is the pattern this ticket exists to kill. Do not “finish” it.

## Out of scope

Invite-accept copy, `/projects` 403, Google button wiring, password reset flow, and any new identity provider. Frame is not grading those.
