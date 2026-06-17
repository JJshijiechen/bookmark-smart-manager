# Smart Bookmark Manager

A local-first browser extension for searching, categorizing, cleaning, and organizing bookmarks without any external API or cloud sync.

## Features

- Search bookmarks by title, URL, and domain from the popup.
- Group bookmarks by domain, category, or custom local category assignments.
- Save the current tab as a bookmark.
- Open all bookmarks from a domain or group.
- Detect duplicate URLs for cleanup.
- Delete selected bookmarks, a domain, or a category group with two-click confirmation.
- Auto-organize bookmarks into top-level category folders on the bookmarks bar.
- Keep all categorization and bookmark operations local to the browser.

## Categories

The extension currently classifies bookmarks into:

- Coding
- Job
- Housing
- Finance
- Shopping
- Docs
- School
- Entertainment
- Travel
- Other

## Install Locally

1. Open Chrome, Edge, Arc, or another Chromium-based browser.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this project folder.

## How It Works

The extension uses Manifest V3 and the browser `chrome.bookmarks`, `chrome.tabs`, and `chrome.storage.local` APIs. It does not require accounts, server calls, OpenAI keys, or third-party APIs.

Auto organize moves original bookmarks into category folders on the visible bookmarks bar. Deletion and organization actions use two-click confirmation to reduce accidental destructive changes.

## Project Structure

```text
.
├── dashboard.html
├── dashboard.js
├── icons/
├── manifest.json
├── popup.html
├── popup.js
├── styles.css
└── utils.js
```

## Privacy

Bookmark data stays inside the local browser profile. The extension does not send bookmark titles, URLs, or categories to any remote service.

## License

No license has been selected yet.
