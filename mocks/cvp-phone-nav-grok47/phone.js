/* Shared markup for the 390×844 phone. Design comp only. */
(function () {
  const projects = [
    ["Harbor Light", "Northline · review due today", "Cut", "4 notes"],
    ["Spring Kit Launch", "Day 2 of 3 · call sheet sent", "Shoot", "On set"],
    ["Field Notes S2", "Brief v3 · waiting on approval", "Brief", "Needs you", true],
    ["Atlas Annual", "Masters in QC", "Delivery", "Encoding"],
    ["West Dock Recap", "Selects locked · comments open", "Cut", "2 notes"],
    ["Civic Hour", "Location confirmed · Friday", "Shoot", "Prep"],
  ];

  function icon(path) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  const icons = {
    menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    search: icon('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
    close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
    projects: icon('<path d="M4 7.5h6l2 2H20v9.5H4z"/>'),
    brief: icon('<path d="M7 4.5h7l4 4V19.5H7z"/><path d="M14 4.5V9h4.5M9 13h6M9 16.5h4"/>'),
    shoot: icon('<path d="M4 8h11v8H4z"/><path d="m15 11 5-2.5v7L15 13"/>'),
    cut: icon('<path d="M8 5.5 16 12 8 18.5z"/>'),
    delivery: icon('<path d="M4 8h10v9H4z"/><path d="M14 11h3.2L20 13.5V17h-6"/><circle cx="7.5" cy="17.5" r="1.2"/><circle cx="16.5" cy="17.5" r="1.2"/>'),
    library: icon('<path d="M5 5.5h4v13H5zM10 5.5h4v13h-4zM15 5.5h4v13h-4z"/>'),
    team: icon('<circle cx="9" cy="9" r="2.4"/><circle cx="16" cy="10" r="2"/><path d="M4.8 17.5c.6-2.2 2.3-3.3 4.2-3.3s3.6 1.1 4.2 3.3M13.2 14.4c1.3-.3 2.6.1 3.4 1.1.7.8 1 1.6 1.2 2"/>'),
    settings: icon('<circle cx="12" cy="12" r="3"/><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.8 6.8l1.4 1.4M15.8 15.8l1.4 1.4M17.2 6.8l-1.4 1.4M8.2 15.8l-1.4 1.4"/>'),
    admin: icon('<path d="M12 4.5 19 7.5v5.2c0 3.4-2.6 5.6-7 6.8-4.4-1.2-7-3.4-7-6.8V7.5z"/>'),
    archive: icon('<path d="M4 8h16v10H4z"/><path d="M4 8 6.5 5h11L20 8M10 12h4"/>'),
    trash: icon('<path d="M5 8h14M9 8V5.5h6V8M8 8l.7 11h6.6L16 8"/>'),
  };

  const rows = projects.map(([name, meta, stage, health, warn]) => `
    <button class="project" type="button">
      <b>${name}</b>
      <span class="stage-word">${stage}</span>
      <em>${meta}</em>
      <em class="health${warn ? " warn" : ""}"><i></i>${health}</em>
    </button>`).join("");

  function rail(active) {
    const items = [
      ["projects", "Projects"],
      ["brief", "Brief"],
      ["shoot", "Shoot"],
      ["cut", "Cut"],
      ["delivery", "Delivery"],
    ];
    return items.map(([id, label]) => `
      <button type="button" ${id === active ? 'aria-current="page"' : ""}>
        ${icons[id]}
        <span>${label}</span>
      </button>`).join("");
  }

  function phone(open) {
    return `
      <article class="phone" data-drawer="${open ? "open" : "closed"}">
        <div class="sheet">
          <div class="status">
            <span>9:41</span>
            <span class="status-icons" aria-hidden="true">
              <svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="7" width="3" height="5" rx="0.6" fill="#040f1c"/><rect x="4.5" y="5" width="3" height="7" rx="0.6" fill="#040f1c"/><rect x="9" y="2.5" width="3" height="9.5" rx="0.6" fill="#040f1c"/><rect x="13.5" y="0" width="3" height="12" rx="0.6" fill="#040f1c"/></svg>
              <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.2c2.2 0 4.2.8 5.7 2.2L15 3.1A9.2 9.2 0 0 0 8 .6 9.2 9.2 0 0 0 1 3.1l1.3 1.3A8 8 0 0 1 8 2.2Zm0 3.2c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 3.8a6.6 6.6 0 0 0-4.7 1.6l1.3 1.3A4.7 4.7 0 0 1 8 5.4ZM8 9.8a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" fill="#040f1c"/></svg>
              <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="2.2" stroke="#040f1c" fill="none"/><rect x="2" y="2" width="15" height="8" rx="1" fill="#040f1c"/><rect x="22.5" y="3.5" width="1.6" height="5" rx="0.5" fill="#040f1c"/></svg>
            </span>
          </div>
          <header class="header">
            <button class="icon-btn" type="button" data-toggle aria-label="More" aria-expanded="${open ? "true" : "false"}">
              ${open ? icons.close : icons.menu}
            </button>
            <div class="brand">
              <span class="mark" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2.2 10 6 3 9.8z" fill="#fff"/></svg>
              </span>
              <span>
                <strong>Co‑VideoPro</strong>
                <small>Projects</small>
              </span>
            </div>
            <button class="icon-btn" type="button" aria-label="Search projects">${icons.search}</button>
          </header>
          <div class="list">
            <div class="list-head">
              <h1>Projects</h1>
              <span>6 active</span>
            </div>
            ${rows}
          </div>
          <nav class="rail" aria-label="Pipeline">
            ${rail("projects")}
          </nav>
          <div class="home-bar" aria-hidden="true"></div>
        </div>
        <div class="scrim" data-toggle></div>
        <aside class="drawer" aria-label="More" aria-hidden="${open ? "false" : "true"}">
          <div class="drawer-head">
            <div class="brand">
              <span class="mark" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2.2 10 6 3 9.8z" fill="#fff"/></svg>
              </span>
              <span>
                <strong>Co‑VideoPro</strong>
                <small>Deep tools</small>
              </span>
            </div>
            <button class="icon-btn" type="button" data-toggle aria-label="Close">${icons.close}</button>
          </div>
          <div class="drawer-scroll">
            <p class="group-label">Library</p>
            <button class="drawer-item" type="button">${icons.library} Media library</button>
            <p class="group-label">Team</p>
            <button class="drawer-item" type="button">${icons.team} People & roles</button>
            <p class="group-label">Settings</p>
            <button class="drawer-item" type="button">${icons.settings} Workspace settings</button>
            <p class="group-label">Admin</p>
            <button class="drawer-item" type="button">${icons.admin} Workspace admin</button>
            <button class="drawer-item sub" type="button">${icons.archive} Archive</button>
            <button class="drawer-item sub" type="button">${icons.trash} Trash</button>
          </div>
          <footer class="drawer-foot">
            <span class="avatar" aria-hidden="true">PR</span>
            <span>
              <strong>Producer</strong>
              <span>Content Co-op workspace</span>
            </span>
          </footer>
        </aside>
      </article>`;
  }

  window.CVPPhone = { phone };

  document.querySelectorAll("[data-phone]").forEach((node) => {
    const open = node.getAttribute("data-phone") === "open";
    node.innerHTML = phone(open);
  });

  document.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-toggle]");
    if (!hit || document.body.classList.contains("shot")) return;
    const phoneEl = hit.closest(".phone");
    if (!phoneEl) return;
    const next = phoneEl.getAttribute("data-drawer") !== "open";
    phoneEl.setAttribute("data-drawer", next ? "open" : "closed");
    phoneEl.querySelectorAll("[data-toggle]").forEach((el) => {
      if (el.hasAttribute("aria-expanded")) el.setAttribute("aria-expanded", String(next));
    });
    const aside = phoneEl.querySelector(".drawer");
    if (aside) aside.setAttribute("aria-hidden", String(!next));
  });
})();
