# Release notes — @andrian.yablonskyy/thub-common

What changed in each release, newest first. `## Unreleased` collects the changes since the version on npm; `bin/publish` turns that heading into the version and date it releases.

## 2.0.0 — 2026-10-09

**2.0.0: a major version**, because exports are removed. The Agent, Client and Coordinator now require `^2.0.0`; released ones keep resolving 1.x (the Client up to 1.1.15 calls `withoutPowerControl`).

### Removed

- **Compatibility with long-gone Agents and Clients.** `validateJobSpec` no longer gives a dedicated message for the old `firmware` / `tests`, `git` and `image` fields: they fail as unknown properties, like any other. The Client config helpers no longer read a `hw` section as `hw-devices` or leave out `relays`, `power`, `sw`, `artifactory` and `sources`: `hwDevicesOf` reads `hw-devices` only, `shareableClientConfigFile` returns a copy, and an old field in `hw-devices` fails the schema. `withoutPowerControl` is gone.
- Unused: `splitArgs` (`split-args.js`), `isValidCron` (use `parseCron`), and the exports `ENV_NAME_PATTERN`, `SCHEDULABLE_RESOURCE_STATES` and `JOB_SOURCES`.

## 1.1.12 — 2026-10-09

Changes since 1.1.11.

### Changed

- **Back on npm.** Version checks and installs of the Agent and Client use npm again: `fetchLatestVersion(pkg, { registry })` reads the npm registry's `latest`, and `npmInstallGlobal(pkg, version)` runs `npm i -g --prefer-online <pkg>@<version>`, retrying a just-published version that isn't downloadable yet. 1.1.11's git-based `REPOSITORIES`, `installSpec`, `installCommand` and `installedFromNpm` are gone. 1.1.10 and 1.1.11 were only released as git tags.

## 1.1.11 — 2026-10-08

Changes since 1.1.10.

### Changed

- **Version checks and installs use git, not npm.** `fetchLatestVersion(pkg)` returns the highest `vX.Y.Z` tag of the package's repository, read with `git ls-remote`, without prompts. `npmInstallGlobal(pkg, version)` runs `npm i -g --install-links <repository>#v<version>`. The npm retry for "not downloadable yet" is gone: a tag is there as soon as it's pushed.
- New: `REPOSITORIES`, `installSpec()`, `installCommand()`, `NPM_INSTALL_ARGS`, and `installedFromNpm(app, version)`, which tells installs up to the last npm version (Agent 1.1.10, Client 1.1.12, Coordinator 1.1.23).
- Removed: `defaultRegistry()` and `NPM_RETRY_DELAYS_SEC`.

## 1.1.10 — 2026-10-08

Changes since 1.1.10.

### Changed

- **Not published to npm any more.** A release is its `vX.Y.Z` tag on GitHub. The Agent, Client and Coordinator require it from there by tag range (`#semver:^…`). `package.json` has `"private": true`.

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
