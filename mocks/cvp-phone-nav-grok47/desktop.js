(function () {
  const icon = (path) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

  const icons = {
    library: icon('<path d="M5 5.5h4v13H5zM10 5.5h4v13h-4zM15 5.5h4v13h-4z"/>'),
    team: icon('<circle cx="9" cy="9" r="2.4"/><circle cx="16" cy="10" r="2"/><path d="M4.8 17.5c.6-2.2 2.3-3.3 4.2-3.3s3.6 1.1 4.2 3.3M13.2 14.4c1.3-.3 2.6.1 3.4 1.1.7.8 1 1.6 1.2 2"/>'),
    settings: icon('<circle cx="12" cy="12" r="3"/><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.8 6.8l1.4 1.4M15.8 15.8l1.4 1.4M17.2 6.8l-1.4 1.4M8.2 15.8l-1.4 1.4"/>'),
    search: icon('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
  };

  const projects = [
    ["Harbor Light", "Northline", "Cut", "Review due today", "4 notes"],
    ["Spring Kit Launch", "Field", "Shoot", "Day 2 of 3", "On set"],
    ["Field Notes S2", "Series", "Brief", "Waiting on approval", "Needs you"],
    ["Atlas Annual", "Studio", "Delivery", "Masters in QC", "Encoding"],
    ["West Dock Recap", "Northline", "Cut", "Comments open", "2 notes"],
    ["Civic Hour", "City desk", "Shoot", "Friday call", "Prep"],
  ];

  function rail() {
    return `
      <aside class="tools" aria-label="Tools">
        <span class="mark" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 2.2 10 6 3 9.8z" fill="#fff"/></svg>
        </span>
        <button class="tool" type="button">${icons.library}<span>Library</span></button>
        <button class="tool" type="button">${icons.team}<span>Team</span></button>
        <button class="tool" type="button">${icons.settings}<span>Settings</span></button>
        <div class="spacer"></div>
        <div class="who" style="flex-direction:column;gap:4px">
          <span class="avatar" aria-hidden="true">PR</span>
        </div>
      </aside>`;
  }

  function top(title) {
    return `
      <header class="top">
        <h1>${title}</h1>
        <div class="search">${icons.search}<span>Search projects</span></div>
        <div class="who"><span class="avatar" aria-hidden="true">PR</span> Producer</div>
      </header>`;
  }

  function hub() {
    const rows = projects.map(([name, client, stage, meta, health]) => `
      <tr>
        <td><strong>${name}</strong><small>${client}</small></td>
        <td><span class="stage-word">${stage}</span></td>
        <td class="meta">${meta}</td>
        <td class="meta">${health}</td>
      </tr>`).join("");
    return `
      <div class="desk" data-screen="hub">
        ${rail()}
        <div class="desk-main">
          ${top("Co‑VideoPro")}
          <div class="canvas">
            <div class="canvas-head">
              <h2>Projects</h2>
              <span>6 active</span>
            </div>
            <table class="table">
              <thead><tr><th>Project</th><th>Stage</th><th>Now</th><th>Health</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function project() {
    const steps = ["Brief", "Shoot", "Cut", "Delivery"].map((name) =>
      `<li${name === "Cut" ? ' aria-current="step"' : ""}>${name}</li>`).join("");
    return `
      <div class="desk" data-screen="project">
        ${rail()}
        <div class="desk-main">
          ${top("Harbor Light")}
          <div class="canvas">
            <div class="canvas-head">
              <h2>Harbor Light</h2>
              <span>Northline · Producer</span>
            </div>
            <ol class="steps" aria-label="Pipeline">${steps}</ol>
            <div class="work">
              <section class="panel" aria-label="Cut">
                <header><h3>Cut</h3><span class="meta">v4 · picture lock</span></header>
                <div class="player">
                  <button class="play" type="button" aria-label="Play">
                    <svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 1.6 10.2 6 3 10.4z" fill="#fff"/></svg>
                  </button>
                  <div><b>Thin player</b><span>Click-to-comment stays on this surface</span></div>
                </div>
                <ul class="notes">
                  <li>00:12 Open on the harbor, hold one beat longer<small>Review note · open</small></li>
                  <li>01:04 Lower the music under the VO<small>Review note · open</small></li>
                  <li>02:18 End card matches the approved brief<small>Review note · done</small></li>
                </ul>
              </section>
              <aside class="panel" aria-label="This step">
                <header><h3>This step</h3></header>
                <ul class="notes">
                  <li>Brief approved<small>Locked</small></li>
                  <li>Shoot wrapped<small>Day 3 of 3</small></li>
                  <li>Cut in review<small>4 notes</small></li>
                  <li>Delivery waiting<small>After picture lock</small></li>
                </ul>
              </aside>
            </div>
          </div>
        </div>
      </div>`;
  }

  document.querySelectorAll("[data-desk]").forEach((node) => {
    node.innerHTML = node.getAttribute("data-desk") === "project" ? project() : hub();
  });
})();
