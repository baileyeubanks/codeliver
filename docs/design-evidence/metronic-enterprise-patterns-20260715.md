# Metronic Enterprise Pattern Review

Reviewed against the official Metronic 9 toolkit and current Co-VideoPro shell on 2026-07-15.

## Product decision

Co-VideoPro should adopt Metronic's enterprise interaction depth without importing its visual identity or replacing the existing shell. The current white cockpit, compact blue actions, fixed navigation hierarchy, and production-specific review surfaces remain authoritative.

The local inventory is /Users/baileyeubanks/Desktop/Projects/metronic-v9.5.0.
It includes HTML and React examples, but Co-VideoPro does not depend on
Metronic and must not import demo shells, theme tokens, Keenicons, sample data,
or assets into its source tree. The local license reminder requires a separate
license decision before direct source or asset reuse. The authoritative
adoption policy is documented in
docs/reality/co-deliver/co-videopro-production-architecture-authority.md.

## Patterns to adopt

- Multi-level navigation that keeps the primary rail compact and moves infrequent tools into submenus or drawers.
- One command surface for search, navigation, and project actions rather than separate competing controls.
- Data tables with local and remote filters, explicit empty states, fixed column sizing, bulk selection, and bulk actions.
- Typed, reusable controls for menus, dialogs, selects, notifications, profile inputs, and settings forms.
- Tokenized theme values so tenant branding changes color and assets without changing layout behavior.
- Reliable sticky headers and side panels with tested responsive fallbacks.
- User-management depth for profiles, security, permissions, roles, and audit-friendly account settings.

## Patterns not to adopt

- Generic dashboard-card composition where production workflow context is more important than metrics.
- A second icon language, navigation shell, or competing design token system.
- Dense controls shown all at once when a drawer, submenu, segmented mode, or contextual action is clearer.
- Theme-level dependencies that would make Co-VideoPro's product behavior depend on a commercial template runtime.

## Sources

- [Metronic overview and component families](https://keenthemes.com/metronic?page=docs)
- [Metronic 9 documentation and layouts](https://keenthemes.com/metronic/tailwind/docs/)
- [Metronic changelog and current data-table capabilities](https://keenthemes.com/metronic/tailwind/docs/changelog)
- [Metronic theming model](https://keenthemes.com/metronic/tailwind/docs/customization/theming/)
