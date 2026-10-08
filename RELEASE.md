# Release notes — @andrian.yablonskyy/thub-common

What changed in each release, newest first. `## Unreleased` collects the changes since the version on npm; `bin/publish` turns that heading into the version and date it releases.

## 1.1.7 — 2026-10-08

Changes since 1.1.6.

### Changed

- **Client device lists hold up to 16 entries** (`hw-devices.stlinks`, `uarts`, `usbs`; was 8): enough for eight boards with two serial ports each — a UART adapter and the board's own USB serial port, both in `uarts`. `index` (→ `/dev/thub/dut<N>-…`) stays 1–8.
- A `uarts` entry may have a **`label`** (`[A-Za-z0-9._-]`, up to 32): the tag on its lines in the job's log.

## 1.1.6 — 2026-10-08

Changes since 1.1.5.

### Added

- **Job reports as Markdown** (`report-markdown.js`, exported from the package root): `renderComment()` and `renderSummary()` turn a finished job into the pull/merge-request comment and the CI summary that the Agent's `thub report` and the GitHub Action post — verdict, board and Client, duration, test counts, failed tests, links to the job's log and the CI run. In three flavors: `github` and `gitlab` (collapsible sections, an HTML-comment marker), and `bitbucket` (no HTML: plain headings, a Markdown link-definition marker).
- `parseJUnit()`: every test case, with its outcome and failure message, from JUnit XML as GoogleTest, CTest, pytest, Maven Surefire and Gradle write it. `countsFromCases()` sums them.
- `commentMarker()` (the invisible first line that identifies a sticky comment) and `statusFor()` (the commit/build status name per code host: GitHub, GitLab, Bitbucket, including running jobs).

### Changed


### Notes

- Nothing existing changed: every earlier export is the same.
- These release notes (`RELEASE.md`) are now part of the package (listed in `"files"`).
