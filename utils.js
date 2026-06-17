const CATEGORIES = [
  "Coding", "Job", "Housing", "Finance", "Shopping", "Docs", "School", "Entertainment", "Travel", "Other"
];

const CATEGORY_RULES = [
  { category: "Coding", domains: ["leetcode", "leetcode.cn", "github", "stackoverflow", "developer.mozilla", "npmjs", "pypi", "react", "vercel", "supabase", "readthedocs", "slack.com/api"], keywords: ["leetcode", "algorithm", "coding", "api", "sdk", "docs", "bug", "programming", "javascript", "python", "interview"] },
  { category: "Job", domains: ["linkedin", "greenhouse", "lever", "workday", "myworkdayjobs", "indeed", "glassdoor", "levels.fyi", "adobe.wd5"], keywords: ["job", "career", "intern", "new grad", "swe", "software engineer", "resume", "interview", "oa", "candidate"] },
  { category: "Housing", domains: ["apartments", "zillow", "redfin", "streeteasy", "trulia"], keywords: ["rent", "lease", "apartment", "housing", "move in", "parking"] },
  { category: "Finance", domains: ["chase", "bankofamerica", "boa", "capitalone", "fidelity", "robinhood", "schwab", "irs", "paypal", "venmo"], keywords: ["credit", "bank", "apr", "statement", "tax", "finance", "payment"] },
  { category: "Shopping", domains: ["amazon", "bestbuy", "target", "walmart", "costco", "ikea", "wayfair", "cartier", "ebay", "etsy"], keywords: ["cart", "checkout", "buy", "order", "price", "shopping"] },
  { category: "Docs", domains: ["docs.google", "drive.google", "sheets.google", "notion", "dropbox", "office", "sharepoint", "onedrive"], keywords: ["document", "spreadsheet", "slides", "drive", "notion", "doc", "sheet"] },
  { category: "School", domains: ["northwestern", "nyu", "canvas", "coursera", "edstem", "gradescope", "aleks", "aetnastudenthealth"], keywords: ["course", "assignment", "homework", "exam", "university", "class", "school", "student"] },
  { category: "Entertainment", domains: ["youtube", "netflix", "bilibili", "spotify", "reddit", "tiktok"], keywords: ["video", "music", "movie", "stream", "reddit"] },
  { category: "Travel", domains: ["google.com/travel", "airlines", "united", "delta", "aa.com", "booking", "hotels", "marriott", "hilton", "airbnb"], keywords: ["flight", "hotel", "trip", "travel", "reservation", "airport"] }
];

const SMART_ROOT_TITLE = "Smart Organized Bookmarks";
const SMART_FOLDER_PREFIX = "Smart · ";

function flattenBookmarks(nodes, result = []) {
  for (const node of nodes) {
    if (node.url) result.push(node);
    if (node.children) flattenBookmarks(node.children, result);
  }
  return result;
}

function flattenFolders(nodes, result = []) {
  for (const node of nodes) {
    if (!node.url) result.push(node);
    if (node.children) flattenFolders(node.children, result);
  }
  return result;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

function normalizeText(value) { return (value || "").toLowerCase(); }

async function getStoredCategories() {
  const data = await chrome.storage.local.get(["bookmarkCategories"]);
  return data.bookmarkCategories || {};
}

async function setStoredCategory(bookmarkId, category) {
  const current = await getStoredCategories();
  current[bookmarkId] = category;
  await chrome.storage.local.set({ bookmarkCategories: current });
}

function autoCategory(bookmark) {
  const title = normalizeText(bookmark.title);
  const url = normalizeText(bookmark.url);
  const domain = normalizeText(getDomain(bookmark.url));
  for (const rule of CATEGORY_RULES) {
    if (rule.domains.some(d => domain.includes(d))) return rule.category;
    if (rule.keywords.some(k => title.includes(k) || url.includes(k))) return rule.category;
  }
  return "Other";
}

async function enrichBookmarks(bookmarks) {
  const stored = await getStoredCategories();
  return bookmarks.map(bookmark => ({
    ...bookmark,
    domain: getDomain(bookmark.url),
    category: stored[bookmark.id] || autoCategory(bookmark)
  }));
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Other";
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}

function filterBookmarks(bookmarks, query, category = "all") {
  const q = normalizeText(query);
  return bookmarks.filter(bookmark => {
    const matchesCategory = category === "all" || bookmark.category === category;
    const matchesQuery = !q || normalizeText(bookmark.title).includes(q) || normalizeText(bookmark.url).includes(q) || normalizeText(bookmark.domain).includes(q);
    return matchesCategory && matchesQuery;
  });
}

function findDuplicateUrlIds(bookmarks) {
  const seen = new Map();
  const duplicates = new Set();
  for (const bookmark of bookmarks) {
    const url = (bookmark.url || "").replace(/\/$/, "");
    if (seen.has(url)) duplicates.add(bookmark.id);
    else seen.set(url, bookmark.id);
  }
  return duplicates;
}

async function loadAllBookmarks() {
  // Show all real bookmarks, including ones previously moved into Smart Organized
  // folders. Earlier versions hid generated Smart folders, which made the popup
  // look empty after a move.
  const tree = await chrome.bookmarks.getTree();
  const flat = flattenBookmarks(tree);
  return enrichBookmarks(flat);
}

function isInsideSmartCopy(bookmark, tree) {
  // Exclude generated copies from the manager list, so rerunning organize does not duplicate itself.
  const folders = flattenFolders(tree);
  const byId = new Map(folders.map(f => [f.id, f]));
  let parent = byId.get(bookmark.parentId);
  while (parent) {
    if (parent.title === SMART_ROOT_TITLE || parent.title.startsWith(SMART_FOLDER_PREFIX)) return true;
    parent = byId.get(parent.parentId);
  }
  return false;
}

async function getRootBookmarkFolders() {
  const tree = await chrome.bookmarks.getTree();
  return (tree?.[0]?.children || []).filter(n => !n.url);
}

async function getBookmarksBarId() {
  // In Chromium, the visible bookmarks bar is usually id "1". Atlas can localize
  // the title, so ID is more reliable than matching English text.
  try {
    const node = await chrome.bookmarks.get("1");
    if (node && node[0] && !node[0].url) return "1";
  } catch (_) {}

  const rootFolders = await getRootBookmarkFolders();
  const titleMatch = rootFolders.find(n => {
    const title = normalizeText(n.title);
    return title.includes("bookmarks bar") || title.includes("bookmark bar") || title.includes("favorites bar") || title.includes("书签栏") || title.includes("收藏夹栏") || title.includes("收藏栏");
  });
  return (titleMatch || rootFolders[0]).id;
}

async function removeOldSmartFoldersEverywhere() {
  const rootFolders = await getRootBookmarkFolders();
  for (const folder of rootFolders) {
    const children = await chrome.bookmarks.getChildren(folder.id);
    for (const child of children) {
      if (!child.url && (child.title === SMART_ROOT_TITLE || child.title.startsWith(SMART_FOLDER_PREFIX) || child.title.startsWith("Smart Organized Bookmarks"))) {
        await chrome.bookmarks.removeTree(child.id);
      }
    }
  }
}

async function createFolder(parentId, title, index) {
  const payload = { parentId, title };
  if (Number.isInteger(index)) payload.index = index;
  return chrome.bookmarks.create(payload);
}

async function copyBookmarkInto(parentId, bookmark) {
  return chrome.bookmarks.create({
    parentId,
    title: bookmark.title || bookmark.url,
    url: bookmark.url
  });
}

async function getOrCreateChildFolder(parentId, title, index) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find(child => !child.url && child.title === title);
  if (existing) return existing;
  return createFolder(parentId, title, index);
}

async function removeEmptyOldSmartFoldersEverywhere() {
  const rootFolders = await getRootBookmarkFolders();
  for (const folder of rootFolders) {
    const children = await chrome.bookmarks.getChildren(folder.id);
    for (const child of children) {
      if (!child.url && (child.title === SMART_ROOT_TITLE || child.title.startsWith(SMART_FOLDER_PREFIX))) {
        const nested = await chrome.bookmarks.getSubTree(child.id);
        const remainingBookmarks = flattenBookmarks(nested);
        if (!remainingBookmarks.length) {
          try { await chrome.bookmarks.removeTree(child.id); } catch (_) {}
        }
      }
    }
  }
}

async function autoOrganizeBookmarks() {
  // Move originals directly into category folders on the visible Bookmarks Bar.
  // No Smart parent folder is created. Existing Smart Organized folders from older
  // versions are also included as sources, so this can recover bookmarks that were
  // previously moved into that folder.
  const bookmarks = await loadAllBookmarks();
  const barId = await getBookmarksBarId();

  const grouped = groupBy(bookmarks, "category");
  const folders = {};

  let folderIndex = 0;
  for (const category of CATEGORIES) {
    if ((grouped[category] || []).length) {
      folders[category] = await getOrCreateChildFolder(barId, category, folderIndex++);
    }
  }

  let moved = 0;
  let skipped = 0;
  const categories = {};
  const errors = [];

  for (const bookmark of bookmarks) {
    const category = bookmark.category || autoCategory(bookmark);
    categories[bookmark.id] = category;
    const target = folders[category] || folders.Other;
    if (!target || !bookmark.url) { skipped++; continue; }
    if (bookmark.parentId === target.id) { skipped++; continue; }
    try {
      await chrome.bookmarks.move(bookmark.id, { parentId: target.id });
      moved++;
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
      console.warn("Could not move bookmark", bookmark, error);
    }
  }

  await chrome.storage.local.set({ bookmarkCategories: categories });
  await removeEmptyOldSmartFoldersEverywhere();

  let barTitle = "Bookmarks Bar";
  try {
    const barNode = await chrome.bookmarks.get(barId);
    if (barNode && barNode[0] && barNode[0].title) barTitle = barNode[0].title;
  } catch (_) {}

  return {
    copied: 0,
    moved,
    skipped,
    rootTitle: "Bookmarks Bar category folders",
    rootId: barId,
    parentId: barId,
    parentTitle: barTitle,
    foldersCreated: Object.keys(folders).length,
    errors
  };
}

async function deleteBookmarksByDomain(domain, bookmarks) {
  const matches = bookmarks.filter(b => b.domain === domain);
  for (const item of matches) await chrome.bookmarks.remove(item.id);
  return matches.length;
}
