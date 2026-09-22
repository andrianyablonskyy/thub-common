# @andrian.yablonskyy/thub-common

Shared code for [TestHub](https://github.com/andrianyablonskyy/thub) — a self-hosted job network that lets CI/CD pipelines and individual developers run firmware tests on real hardware or emulators in a private lab. This package has no server and no CLI of its own; it's the small, dependency-light core that the [Agent](https://github.com/andrianyablonskyy/thub-agent), [Coordinator](https://github.com/andrianyablonskyy/thub-coordinator) and [Client](https://github.com/andrianyablonskyy/thub-client) all depend on, so the three speak exactly the same protocol.

See the [main TestHub repo](https://github.com/andrianyablonskyy/thub) for the full system architecture, deployment diagrams and end-to-end flows.

## Install

```bash
npm install @andrian.yablonskyy/thub-common
```

## What's in it

### Job spec schema and validation

An [Ajv](https://ajv.js.org/) JSON schema for the job specification the Agent sends to the Coordinator, and a thin wrapper that validates a spec and fills in its defaults.

```js
const { validateJobSpec } = require('@andrian.yablonskyy/thub-common');

const { valid, spec, errors } = validateJobSpec({
  target: { type: 'hw', labels: ['board:nucleo-f401re'] },
  firmware: { url: 'https://artifactory.example.com/app.bin' },
  tests: { url: 'https://artifactory.example.com/tests.tar.gz' }
});
```

The schema deliberately has no field for shell commands — a job only ever names a firmware image and a test package; the Client runs a fixed entry point (`run-tests.sh`) from that package, never arbitrary code from the spec itself. Top-level fields: `target` (`type`, `labels`, optional `group`), `firmware` (`url`, optional `sha256`/`flashAddress`), `tests` (`url`, `suite`, `args`), `timeoutSec`, `priority`, `source` (`ci`/`cli`), `user` (a free-text job-owner label), `meta` (arbitrary key/value metadata), and `dryRun`.

### State enums and exit codes

```js
const { RESOURCE_STATES, JOB_STATES, ACTIVE_JOB_STATES, TERMINAL_JOB_STATES, BUSY_SOURCES, EXIT_CODES, exitCodeForJobState } = require('@andrian.yablonskyy/thub-common');
```

- `RESOURCE_STATES`: `REGISTERED`, `IDLE`, `BUSY`, `OUT_OF_SERVICE`, `MAINTENANCE`.
- `JOB_STATES`: `QUEUED`, `ASSIGNED`, `PREPARING`, `RUNNING`, `PASSED`, `FAILED`, `ERROR`, `TIMEOUT`, `CANCELED`, `LOST`. `ACTIVE_JOB_STATES`/`TERMINAL_JOB_STATES` are the two natural partitions of that set.
- `BUSY_SOURCES`: `ci`, `cli`, `local` — why a resource is currently busy.
- `EXIT_CODES` / `exitCodeForJobState(state)`: the Agent CLI's process exit codes (`PASSED` → 0, `FAILED` → 1, `ERROR`/`TIMEOUT`/`LOST` → 2, `CANCELED` → 3, usage/auth error → 4, detached with Ctrl-C → 130), so a CI step can branch on `$?` without parsing output.

### API client

A minimal `fetch`-based HTTP client for the Coordinator's `/api/v1` surface, with a hand-rolled Server-Sent-Events parser (no external SSE dependency) — used by both the Agent and the Client so they speak the exact same protocol.

```js
const { ApiClient } = require('@andrian.yablonskyy/thub-common');

const client = new ApiClient({ baseUrl: 'https://thub.example.com', token: 'agt_...' });
const job = await client.post('/jobs', spec);
await client.streamEvents(`/jobs/${job.jobId}/logs/stream`, {
  onEvent: ({ event, id, data }) => console.log(event, data)
});
```

`request()`/`get()`/`post()` handle JSON bodies, query strings and non-2xx errors (throwing with `.status`/`.body` set); `streamEvents()` reconnects the caller is expected to drive (it just parses one connection's worth of events and resolves when the stream ends) and honors `Last-Event-ID` for resuming after a drop.

## Development

```bash
npm install
npm test    # node --test test/*.test.js
npm run lint
```

## License

See [LICENSE.md](./LICENSE.md).
