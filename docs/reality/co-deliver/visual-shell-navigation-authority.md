# Co-Deliver Visual Shell Navigation Authority

## Route authority

- The bright internal cockpit shown by the visual reference at `/Users/baileyeubanks/Downloads/f41e61e5-4998-4cfd-8c58-13dbe6490f58-2026-07-15 (1).png` is the authority for internal demo review.
- Every internal demo media action must remain at `/projects/{projectId}?demo=1&asset={assetId}&view=review` so project navigation, operator controls, and the cockpit shell remain present.
- `/review/demo?...` is the stripped recipient surface. It is valid only for genuine public review links created by the share-link flow.

## Regression checkpoint

`tests/visual-shell-navigation.test.ts` fails when:

- a seeded asset in `lib/demo/workspace.ts` points outside its project cockpit;
- the demo upload constructor in `app/(dashboard)/projects/[id]/page.tsx` stops using the internal route builder or embeds `/review/demo`;
- the dashboard upload constructor in `app/(dashboard)/projects/page.tsx` stops using the internal route builder or embeds `/review/demo`;
- restored current, archived, or trashed demo assets retain stale external review hrefs;
- generated demo recipient links stop using the external `/review/demo` surface.

Persisted demo asset collections are normalized during restore. Persisted `shareLinks` are not normalized because their `public_url` values intentionally belong to the recipient review surface.

Run the checkpoint with:

```sh
node --experimental-strip-types --test tests/visual-shell-navigation.test.ts
```
