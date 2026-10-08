# Release notes — @andrian.yablonskyy/thub-common

What changed in each release, newest first. `## Unreleased` collects the changes since the version on npm; `bin/publish` turns that heading into the version and date it releases.

## Unreleased

Changes since 1.1.5.

### Added

- **Job reports as Markdown** (`report-markdown.js`, exported from the package root): `renderComment()` and `renderSummary()` turn a finished job into the pull/merge-request comment and the CI summary that the Agent's `thub report` and the GitHub Action post — verdict, board and Client, duration, test counts, failed tests, links to the job's log and the CI run. In three flavors: `github` and `gitlab` (collapsible sections, an HTML-comment marker), and `bitbucket` (no HTML: plain headings, a Markdown link-definition marker).
- `parseJUnit()`: every test case, with its outcome and failure message, from JUnit XML as GoogleTest, CTest, pytest, Maven Surefire and Gradle write it. `countsFromCases()` sums them.
- `commentMarker()` (the invisible first line that identifies a sticky comment) and `statusFor()` (the commit/build status name per code host: GitHub, GitLab, Bitbucket, including running jobs).

### Notes

- Nothing existing changed: every earlier export is the same.
