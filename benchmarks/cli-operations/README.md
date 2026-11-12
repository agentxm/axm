# Compare performance across the CLI

Use this harness when a CLI change needs a complete before/after command
comparison. It runs compiled processes against disposable fixtures and retains
raw timing, resource, and separate system-call evidence. Accepted executable
specifications remain the requirements authority; this diagnostic report does
not establish behavioral acceptance or authorize integration.

The [repository task interface](../../docs/guides/repository-task-interface.md)
owns toolchain prerequisites and target semantics. Install the pinned toolchain
and dependencies before invoking the targets below. Linux diagnostics also need
`strace` on `PATH`; other hosts currently report that diagnostic as unavailable.

## Capture a comparable pair

1. Build the baseline using `pnpm exec nx run cli:compile-host` at its exact
   source revision. Preserve the compiled binary outside mutable build output.
2. Run `pnpm exec nx run cli:export:benchmark-inventory` at that revision and
   preserve `test-results/benchmarks/cli-operations/command-inventory.json` beside
   the binary. The CLI owner walks actual registrations, capability metadata,
   parser parameters, and help topics to produce this snapshot.
3. Finish fixture development and freeze the harness before collecting either
   comparison subject. Run the full baseline before production refactoring.
4. Collect the baseline with the published target. Replace the paths and full
   source SHA in this example with the preserved subject's identities:

   ```bash
   export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static
   export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false
   AXM_OPERATIONS_SUBJECT=baseline \
     AXM_OPERATIONS_BINARY=/tmp/axm-baseline/axm \
     AXM_OPERATIONS_REVISION=FULL_BASELINE_SHA \
     AXM_OPERATIONS_INVENTORY=/tmp/axm-baseline/command-inventory.json \
     AXM_OPERATIONS_OUTPUT=/tmp/axm-comparison/baseline.json \
     pnpm exec nx run axm:bench:operations
   ```

5. After implementation and verification, collect the candidate on the same
   host. The target builds its compiled host binary and refreshes its command
   inventory. Set `AXM_OPERATIONS_SUBJECT=candidate`, the exact candidate source
   SHA, a separate output path, and
   `AXM_OPERATIONS_COMPARE=/tmp/axm-comparison/baseline.json`. Omit the baseline
   binary and inventory overrides so the candidate uses its own outputs.
6. Retain both reports, the `receipts/` and `traces/` directories, and
   `comparison.json`. Review individual regressions and incomplete rows before
   claiming the comparison is complete. Keep builds and unrelated verification
   processes out of the timed collection interval.

The existing `axm:bench` target can select the same harness with
`AXM_BENCHMARK_SUITE=operations`; refresh the command inventory first when using
that entrypoint. The dedicated target declares this prerequisite itself.

`pnpm exec nx run axm:bench:operations:coverage` checks the current registrations
against scenario declarations without executing commands. It is also an
`axm:test` prerequisite. This inexpensive check catches missing routes, modes,
flag classifications, and fixture dimensions; successful collection and a
complete comparison remain separate evidence.

## Interpret the report

[protocol.ts](protocol.ts) fixes one first invocation, three warmups, and twenty
measured invocations per scenario before candidate measurement. Each invocation
starts with a new disposable workspace and home; preparation and verification
are outside timing. The timed interval includes process creation, output drain,
and exit. The operating-system filesystem cache is not evicted. Fixture-specific
AXM cache state and remote behavior belong to the scenario definition.

The report retains raw samples and nearest-rank p50/p95, minimum, maximum, and
spread. CPU and peak RSS describe the child process. Unavailable counters are
`null`, never zero. A separate diagnostic invocation exercises the same scenario
under `strace`; its duration is excluded from timing distributions. Its counters
describe physical system calls, while semantic parsing, rendering, validation,
and lock claims need evidence at their owning capabilities.

The comparison flags an individual scenario if its p50 or p95 increases by more
than both 10% and 20 ms. These are investigation thresholds, not newly accepted
product performance budgets. An aggregate improvement does not dispose of a
flagged operation. Existing performance specifications retain their own bounds.

The coverage checker requires every generated route/mode and every declared
scenario to have comparable baseline and candidate receipts. Static help cannot
substitute for an operation. Architecture-inapplicable operations still require
measurements. Reported refusal cases must represent the intended refusal path;
they do not substitute for an operation's meaningful success fixture.

A confirmed pre-existing defect can have an explicit `knownBaselineLimitation`
in its scenario. That fixture records the incorrect baseline state in a named
metric, asserts the exact known baseline behavior, and requires the correct
state from the candidate. Inputs and measured commands remain identical. A
passing baseline receipt in such a row means that the documented observation
was reproduced; it does not mean the baseline satisfies the product contract.
Unexpected failures remain incomplete rather than being accepted by this rule.

Every parsed flag has an explicit classification: independent mode, fixture
dimension, configuration input, policy, or interaction. An unknown flag blocks
complete collection. Each scenario declares its actual scope, source, selection,
filesystem or Git-index view, output, transition state, format, and extension
kinds. These dimensions describe exercised cases; listing a supported flag value
does not claim that every combination was executed.

## Debug and resume

`AXM_OPERATIONS_SELECT` filters comma-separated scenario-ID substrings.
`AXM_OPERATIONS_SMOKE=1` executes one invocation with a distinct smoke protocol.
Both are diagnostic selections and leave `collectionComplete` false. A normal
full collection refuses to start when the scenario registry omits a required
route or mode.

`AXM_OPERATIONS_RESUME=1` reads an existing report at the output path and skips
completed scenarios. Resume rejects a changed binary, source revision, host,
protocol, or harness digest. It retries failed or missing diagnostics without
repeating valid timing samples. An edited fixture requires new comparable
collection rather than relabeling old evidence.

An unavailable diagnostic, a failed case, a missing mode, or incompatible
comparison inputs remains visible as incomplete. Scenario ownership and the
separate architecture-allocation matrix describe what the evidence establishes;
benchmark coverage alone cannot prove that an architectural migration is done.

## Script installation fixtures

Script reinstall cases require `openssl` on `PATH` to issue a disposable CA and
a certificate for the release host. Certificate generation and copying the
installed binary happen before timing. The fixture serves the exact compiled
subject as its release payload, with a matching SHA256SUMS entry. `--reinstall`
therefore measures actual download, checksum verification, staging, executable
replacement, and installed-version verification even though the version stays
the same. Preview verifies that those downloads and writes do not occur; the
bad-checksum case verifies that the original executable and metadata survive.

Only the measured child's environment receives the loopback proxy and CA path.
The proxy accepts `releases.axm.sh:443` and connects solely to its own loopback
TLS server; it has no external forwarding route. Normal certificate and hostname
validation remain enabled. Bun documents the
[proxy environment variables](https://bun.sh/docs/runtime/networking/fetch#proxying-requests)
and [additional trusted CA file](https://bun.sh/docs/runtime/environment-variables#configuring-bun)
used by this setup. No host trust store, DNS configuration, or production release
service is changed or contacted.

The report retains release request counts and served body bytes. These rows
exercise the compiled client's installation path against deterministic local
transport; they do not measure production network latency or prove a different
release version works. Baseline and candidate each serve their own preserved
artifact, so changes in binary size remain visible in the byte counters and
timings. Platform-specific replacement behavior still needs its owning CI
coverage.
