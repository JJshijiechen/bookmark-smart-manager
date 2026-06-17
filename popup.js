let allBookmarks = [];
let activeCategory = "all";
let pendingDeleteDomain = null;
let pendingAutoMove = false;

const stats = document.getElementById("stats");
const searchInput = document.getElementById("searchInput");
const bookmarkGroups = document.getElementById("bookmarkGroups");
const saveCurrentTab = document.getElementById("saveCurrentTab");
const openDashboard = document.getElementById("openDashboard");
const findDuplicates = document.getElementById("findDuplicates");
const refreshBtn = document.getElementById("refreshBtn");
const autoOrganize = document.getElementById("autoOrganize");
const popupStatus = document.getElementById("popupStatus");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

async function init() {
  bookmarkGroups.innerHTML = `<div class="popup-empty">Loading bookmarks...</div>`;
  try {
    allBookmarks = await loadAllBookmarks();
    render();
  } catch (error) {
    console.error(error);
    stats.textContent = "Could not load";
    bookmarkGroups.innerHTML = `<div class="popup-empty">Could not load bookmarks. Reload the extension and try again.</div>`;
  }
}

function render() {
  const filtered = filterBookmarks(allBookmarks, searchInput.value, activeCategory);
  stats.textContent = `${filtered.length} shown · ${allBookmarks.length} total`;

  if (!filtered.length) {
    bookmarkGroups.innerHTML = `<div class="popup-empty">No bookmarks found.</div>`;
    return;
  }

  const grouped = Object.entries(groupBy(filtered, "domain"))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  bookmarkGroups.innerHTML = grouped.slice(0, 18).map(([domain, items]) => {
    const visibleItems = items
      .slice()
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      .slice(0, 5);

    return `
      <section class="popup-domain-section">
        <div class="popup-domain-header">
          <div class="popup-domain-heading">
            <div class="popup-domain-title" title="${escapeAttr(domain)}">${escapeHtml(domain)}</div>
            <div class="popup-domain-count">${items.length} item${items.length === 1 ? "" : "s"}</div>
          </div>
          <div class="popup-domain-actions">
            <button class="mini-btn" data-open-domain="${escapeAttr(domain)}">Open all</button>
            <button class="mini-btn danger-text" data-delete-domain="${escapeAttr(domain)}">${pendingDeleteDomain === domain ? "Click again" : "Delete domain"}</button>
          </div>
        </div>
        ${visibleItems.map(item => `
          <div class="popup-bookmark-card">
            <div class="popup-bookmark-main">
              <div class="popup-bookmark-title" title="${escapeAttr(item.title || item.url)}">${escapeHtml(item.title || "Untitled")}</div>
              <div class="popup-bookmark-url" title="${escapeAttr(item.url)}">${escapeHtml(item.url)}</div>
            </div>
            <span class="popup-category-pill">${escapeHtml(item.category)}</span>
            <button class="mini-btn" data-open="${escapeAttr(item.id)}">Open</button>
          </div>
        `).join("")}
        ${items.length > visibleItems.length ? `<button class="show-more" data-dashboard="1">+ ${items.length - visibleItems.length} more in dashboard</button>` : ""}
      </section>
    `;
  }).join("") + (grouped.length > 18 ? `<button class="popup-more-btn" data-dashboard="1">Open dashboard to view ${grouped.length - 18} more domains</button>` : "");
}

searchInput.addEventListener("input", () => { pendingDeleteDomain = null; render(); });
refreshBtn.addEventListener("click", () => { pendingDeleteDomain = null; init(); });

saveCurrentTab.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  await chrome.bookmarks.create({ title: tab.title || tab.url, url: tab.url });
  await init();
});

autoOrganize.addEventListener("click", async () => {
  // Moving is destructive to the current folder layout, so use a two-click
  // confirmation instead of native confirm(), which is unreliable in Atlas.
  if (!pendingAutoMove) {
    pendingAutoMove = true;
    autoOrganize.textContent = "Confirm move";
    if (popupStatus) popupStatus.textContent = "Click Confirm move to move original bookmarks directly into Coding / Job / Housing / Docs folders on the bookmarks bar.";
    return;
  }

  autoOrganize.disabled = true;
  autoOrganize.textContent = "Moving...";
  if (popupStatus) popupStatus.textContent = "Moving original bookmarks into category folders on the bookmarks bar...";
  try {
    const result = await autoOrganizeBookmarks();
    pendingAutoMove = false;
    await init();
    if (popupStatus) popupStatus.textContent = `Done: moved ${result.moved} bookmarks into ${result.foldersCreated} top-level category folders. Skipped ${result.skipped} already organized.`;
  } catch (error) {
    console.error(error);
    pendingAutoMove = false;
    if (popupStatus) popupStatus.textContent = `Auto organize failed: ${error && error.message ? error.message : "unknown error"}`;
  } finally {
    autoOrganize.disabled = false;
    autoOrganize.textContent = "Auto organize";
  }
});

openDashboard.addEventListener("click", () => chrome.runtime.openOptionsPage());
findDuplicates.addEventListener("click", () => chrome.runtime.openOptionsPage());

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.filter;
    render();
  });
});

bookmarkGroups.addEventListener("click", async event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.dashboard) chrome.runtime.openOptionsPage();

  const openId = target.dataset.open;
  if (openId) {
    const item = allBookmarks.find(b => b.id === openId);
    if (item) chrome.tabs.create({ url: item.url });
  }

  const openDomain = target.dataset.openDomain;
  if (openDomain) {
    allBookmarks.filter(b => b.domain === openDomain).forEach(b => chrome.tabs.create({ url: b.url }));
  }

  const deleteDomain = target.dataset.deleteDomain;
  if (deleteDomain) {
    const count = allBookmarks.filter(b => b.domain === deleteDomain).length;

    // Atlas can stop extension code after native confirm(). Use a safe two-click
    // confirmation instead: first click arms the delete, second click executes.
    if (pendingDeleteDomain !== deleteDomain) {
      pendingDeleteDomain = deleteDomain;
      if (popupStatus) popupStatus.textContent = `Click Delete domain again to remove ${count} original bookmarks from ${deleteDomain}.`;
      render();
      return;
    }

    target.disabled = true;
    target.textContent = "Deleting...";
    if (popupStatus) popupStatus.textContent = `Deleting ${count} bookmarks from ${deleteDomain}...`;
    try {
      const deleted = await deleteBookmarksByDomain(deleteDomain, allBookmarks);
      pendingDeleteDomain = null;
      await init();
      if (popupStatus) popupStatus.textContent = `Deleted ${deleted} bookmarks from ${deleteDomain}.`;
    } catch (error) {
      console.error(error);
      pendingDeleteDomain = null;
      if (popupStatus) popupStatus.textContent = `Delete failed: ${error && error.message ? error.message : "unknown error"}`;
      await init();
    }
  }
});

init();
