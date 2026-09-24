# Co-VideoPro phone nav (design comp)

Static HTML/CSS only. The live shell, player, auth, and review UI are unchanged.

Open `index.html` for both 390×844 states. `state-a.html` and `state-b.html` are the screenshot frames. On the gallery page, the header menu toggles the drawer.

- After login the phone lands on a **Projects** list. There is no widget dashboard on this surface.
- The phone keeps a single thin bottom rail: **Projects, Brief, Shoot, Cut, Delivery**. There is no permanent left column beside it.
- **More** (the header menu) slides a left drawer over the list for Library, Team, Settings, and Admin. It is not a second rail.
- Chrome stays quiet sapphire: white surfaces, `#f7f9fc` canvas, `#0057ff` for the active stage and the mark. Stage names are words, not a color rainbow.
- The review player and click-to-comment surface are out of this comp, so this nav does not add a side column or a taller bar on top of that work.

Desktop is the same information architecture at 1440×900. `desktop-a.html` is the Projects hub. `desktop-b.html` is inside a project. There is no bottom bar on desktop.

- Login still opens **Projects**. The hub is a list, not a widget dashboard.
- A thin left rail holds **Library, Team, and Settings** only. Pipeline steps are not a second rail.
- Inside a project, **Brief → Shoot → Cut → Delivery** is a quiet step row in the page.
- Desktop does not combine a left rail with a bottom bar. That pairing stays a phone problem, and the phone comp already drops the permanent column.
