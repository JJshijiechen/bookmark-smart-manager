# PRD: Smart Bookmark Manager

## Background

Browser bookmarks often become hard to scan after months of saving links across job search, coding, school, housing, finance, shopping, and documentation workflows. This extension provides a local tool for searching, categorizing, cleaning, and organizing bookmarks without any external service.

## Goals

- Make large bookmark collections easier to search and scan.
- Provide automatic local categorization based on domain and keyword rules.
- Help users find duplicate URLs and remove unwanted bookmarks.
- Support direct organization into category folders on the bookmarks bar.
- Keep all bookmark data local to the browser.

## Non-Goals

- Cloud sync beyond the browser's own bookmark sync.
- AI categorization through remote APIs.
- Cross-browser account management.
- Server-side analytics or telemetry.

## Target Users

- Students and software engineers who save many technical, career, housing, and document links.
- Users who want bookmark cleanup without exporting data to a third-party service.
- Users who prefer simple category folders over deeply nested bookmark structures.

## Core Workflows

1. Search bookmarks from the popup.
2. Filter common categories from the popup.
3. Open the dashboard for full bookmark management.
4. Re-categorize bookmarks locally.
5. Select duplicate URLs and delete selected entries.
6. Auto-organize bookmarks into category folders.

## Success Criteria

- The extension loads as an unpacked Manifest V3 extension.
- Bookmarks can be searched by title, URL, and domain.
- Bookmarks receive a category without network calls.
- Duplicate URLs can be selected for review.
- Deletion and auto-organize flows require a second confirmation click.
- Auto-organize creates or reuses category folders on the bookmarks bar.

## Risks

- Browser bookmark APIs can behave differently across Chromium-based browsers.
- Auto-organize changes the user's bookmark folder layout.
- Domain and keyword rules may misclassify ambiguous bookmarks.

## Future Ideas

- Import/export category rules.
- Add custom category management.
- Add undo support for recent organize or delete actions.
- Add optional dry-run preview before auto-organize.
