# FRAME — CVP login, ACS source of truth

**Lock:** [FRAME_CVP_SOT_SPLIT_LOCKED_20260923](./FRAME_CVP_SOT_SPLIT_LOCKED_20260923.md).
**SoT:** live ACS admin sign-in, [admin.astrocleanings.com/login](https://admin.astrocleanings.com/login), shot 2026-09-23.
**CVP door:** `app/login/page.tsx` inside `components/auth/AuthShell.tsx`.
**Land:** M2 Content-Co-op-9 when Reel implements. Not this notes pass.

## Decision

The CVP door copies ACS quietness, not Wistia marketing. One centered mark, one card, one primary path. The Hook line may be the headline. The button may read **Sign in**. Email, password, and forgot password stay. Nothing else gets a voice.

ACS, as shot: mark centered on a light ground, one white card, one blue headline (“Admin sign in”), one instruction line, one full-width primary, email and password inside the card, forgot password under them. No app header. No rail. No second column. No chips.

## Grade — Cut, A1–A8

Pass only on the running CVP login, desktop and 390px. A fail names the visible string.

| # | Pass when |
|---|---|
| A1 | One centered mark. No app header, no “Video production workspace”, no host chip, no nav rail. |
| A2 | One card. No right promo rail. No left manifesto column. |
| A3 | One headline. `Open the cut that still needs a decision.` is the allowed headline. No second heading. |
| A4 | One primary button whose label is `Sign in`. Demo uses `Sign in`. Loading may read `Signing in…`. |
| A5 | Email, password, and Forgot password? are still there. Show/hide stays an icon. |
| A6 | These are gone: PORTAL, SESSION, RETURN, Account access, Private account access, and the shield essay. |
| A7 | `Brief → shoot → cut → delivery` is gone, and so is the second mark above that crumb. |
| A8 | The page is not Wistia marketing. No “Start a free trial”, no “Get started”, no logo wall, no Captions callout, no webinar sidebar. |

Google may stay as one quiet alternate. It does not get its own headline, and it does not become a Microsoft or SSO row.

`packages/ui/src/product-login-shell.tsx` stays unwired.

Player work does not belong in this file.
