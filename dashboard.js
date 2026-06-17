let allBookmarks = [];
let selectedIds = new Set();
let groupMode = "category";
let pendingDeleteGroupKey = null;
let pendingDeleteSelected = false;
let pendingAutoMove = false;

const dashboardSearch = document.getElementById("dashboardSearch");
const dashboardStats = document.getElementById("dashboardStats");
const dashboardList = document.getElementById("dashboardList");
const reCategorize = document.getElementById("reCategorize");
const selectDuplicates = document.getElementById("selectDuplicates");
const deleteSelected = document.getElementById("deleteSelected");
const autoOrganize = document.getElementById("autoOrganize");
const actionStatus = document.getElementById("actionStatus");

async function init() {
  allBookmarks = await loadAllBookmarks();
  render();
}

function render() {
  const filtered = filterBookmarks(allBookmarks, dashboardSearch.value, "all");
  dashboardStats.textContent = `${filtered.length} shown · ${selectedIds.size} selected`;
  const grouped = groupBy(filtered, groupMode);
  const sortedGroups = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));

  if (!sortedGroups.length) {
    dashboardList.innerHTML = `<div class="empty">No bookmarks found.</div>`;
    return;
  }

  dashboardList.innerHTML = sortedGroups.map(([group, items]) => `
    <section class="group-card">
      <div class="group-header">
        <div>
          <div class="group-title">${escapeHtml(group)}</div>
          <div class="group-count">${items.length} items</div>
        </div>
        <div class="group-actions">
          <button data-open-group="${escapeAttr(group)}">Open all</button>
          <button class="danger" data-delete-group="${escapeAttr(group)}">${pendingDeleteGroupKey === `${groupMode}:${group}` ? "Click again to delete" : `Delete ${groupMode === "domain" ? "domain" : "group"}`}</button>
        </div>
      </div>
      ${items.map(item => `
        <div class="dashboard-item">
          <input type="checkbox" data-select="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""} />
          <div>
            <div class="bookmark-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title || "Untitled")} <span class="badge">${escapeHtml(item.domain)}</span></div>
            <div class="bookmark-meta">${escapeHtml(item.url)}</div>
          </div>
          <select class="category-select" data-category-id="${item.id}">
            ${CATEGORIES.map(cat => `<option value="${cat}" ${cat === item.category ? "selected" : ""}>${cat}</option>`).join("")}
          </select>
          <div class="row-actions">
            <button data-open="${item.id}">Open</button>
            <button data-delete="${item.id}">Delete</button>
          </div>
        </div>
      `).join("")}
    </section>
  `).join("");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

dashboardSearch.addEventListener("input", () => { pendingDeleteGroupKey = null; pendingDeleteSelected = false; render(); });

document.querySelectorAll("input[name='groupBy']").forEach(radio => {
  radio.addEventListener("change", event => {
    groupMode = event.target.value;
    pendingDeleteGroupKey = null;
    pendingDeleteSelected = false;
    render();
  });
});


autoOrganize.addEventListener("click", async () => {
  // Moving changes the user's bookmark layout. Use two-click confirmation instead
  // of native confirm(), which is unreliable in Atlas extension pages.
  if (!pendingAutoMove) {
    pendingAutoMove = true;
    autoOrganize.textContent = "Confirm move";
    if (actionStatus) actionStatus.textContent = "Click Confirm move to move original bookmarks directly into top-level category folders on the bookmarks bar. No Smart parent folder will be created.";
    return;
  }

  autoOrganize.disabled = true;
  autoOrganize.textContent = "Moving...";
  if (actionStatus) actionStatus.textContent = "Moving original bookmarks into top-level category folders...";
  try {
    const result = await autoOrganizeBookmarks();
    pendingAutoMove = false;
    selectedIds.clear();
    await init();
    if (actionStatus) {
      actionStatus.textContent = `Done: moved ${result.moved} bookmarks into ${result.foldersCreated} top-level category folders under '${result.parentTitle}'. Skipped ${result.skipped} already organized.`;
    }
  } catch (error) {
    console.error(error);
    pendingAutoMove = false;
    if (actionStatus) actionStatus.textContent = `Auto organize failed: ${error && error.message ? error.message : "unknown error"}`;
  } finally {
    autoOrganize.disabled = false;
    autoOrganize.textContent = "Auto organize into folders";
  }
});

reCategorize.addEventListener("click", async () => {
  const categories = {};
  for (const bookmark of allBookmarks) categories[bookmark.id] = autoCategory(bookmark);
  await chrome.storage.local.set({ bookmarkCategories: categories });
  await init();
});

selectDuplicates.addEventListener("click", () => {
  selectedIds = findDuplicateUrlIds(allBookmarks);
  render();
});

deleteSelected.addEventListener("click", async () => {
  if (!selectedIds.size) return;

  // Avoid native confirm() in Atlas extension pages. First click arms, second click deletes.
  if (!pendingDeleteSelected) {
    pendingDeleteSelected = true;
    deleteSelected.textContent = `Click again to delete ${selectedIds.size}`;
    if (actionStatus) actionStatus.textContent = `Click Delete selected again to remove ${selectedIds.size} original bookmarks.`;
    return;
  }

  deleteSelected.disabled = true;
  deleteSelected.textContent = "Deleting...";
  if (actionStatus) actionStatus.textContent = `Deleting ${selectedIds.size} selected bookmarks...`;
  try {
    const ids = Array.from(selectedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        await chrome.bookmarks.remove(id);
        deleted++;
      } catch (error) {
        console.warn("Could not delete bookmark", id, error);
      }
    }
    selectedIds.clear();
    pendingDeleteSelected = false;
    await init();
    if (actionStatus) actionStatus.textContent = `Deleted ${deleted} selected bookmarks.`;
  } finally {
    deleteSelected.disabled = false;
    deleteSelected.textContent = "Delete selected";
  }
});

dashboardList.addEventListener("change", async event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.select) {
    if (target.checked) selectedIds.add(target.dataset.select);
    else selectedIds.delete(target.dataset.select);
    render();
  }

  if (target.dataset.categoryId) {
    await setStoredCategory(target.dataset.categoryId, target.value);
    const bookmark = allBookmarks.find(b => b.id === target.dataset.categoryId);
    if (bookmark) bookmark.category = target.value;
    render();
  }
});

dashboardList.addEventListener("click", async event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const openId = target.dataset.open;
  const deleteId = target.dataset.delete;
  const openGroup = target.dataset.openGroup;
  const deleteGroup = target.dataset.deleteGroup;

  if (openId) {
    const item = allBookmarks.find(b => b.id === openId);
    if (item) chrome.tabs.create({ url: item.url });
  }

  if (deleteId) {
    await chrome.bookmarks.remove(deleteId);
    selectedIds.delete(deleteId);
    await init();
  }

  if (openGroup) {
    const matches = allBookmarks.filter(b => b[groupMode] === openGroup);
    matches.forEach(b => chrome.tabs.create({ url: b.url }));
  }

  if (deleteGroup) {
    const matches = allBookmarks.filter(b => b[groupMode] === deleteGroup);
    const label = groupMode === "domain" ? `domain ${deleteGroup}` : `group ${deleteGroup}`;
    const key = `${groupMode}:${deleteGroup}`;

    // Atlas can fail to continue after native confirm(). Use two-click confirmation.
    if (pendingDeleteGroupKey !== key) {
      pendingDeleteGroupKey = key;
      pendingDeleteSelected = false;
      if (actionStatus) actionStatus.textContent = `Click Delete ${groupMode === "domain" ? "domain" : "group"} again to remove ${matches.length} original bookmarks in ${label}.`;
      render();
      return;
    }

    target.disabled = true;
    target.textContent = "Deleting...";
    if (actionStatus) actionStatus.textContent = `Deleting ${matches.length} original bookmarks in ${label}...`;
    let deleted = 0;
    for (const bookmark of matches) {
      try {
        await chrome.bookmarks.remove(bookmark.id);
        selectedIds.delete(bookmark.id);
        deleted++;
      } catch (error) {
        console.warn("Could not delete bookmark", bookmark.id, error);
      }
    }
    pendingDeleteGroupKey = null;
    await init();
    if (actionStatus) actionStatus.textContent = `Deleted ${deleted} original bookmarks in ${label}.`;
  }
});

init();
