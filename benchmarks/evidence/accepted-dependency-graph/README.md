# Accepted dependency graph lifecycle evidence

This record helps reviewers distinguish eliminated work from timing variation
and interpret the preserved lifecycle reports. Executable specifications own
behavioral requirements; these measurements are diagnostic evidence.

## Reduced workloads

Fixture 11 separates package count from content size. At 1, 10, 50, and 200
packages it measures cold configured install, warm configured install, and
ordinary list. The one-package fixture also retains the small restoration,
preview, update, retry, Git, and path diagnostics. A separate one-package
large-content fixture uses 2 MiB of deterministic seed bytes encoded as base64.

Both control and instrumented modes remain. The default matrix has 58 samples,
down from 106; each larger package-count fixture has six samples instead of 24. These are workload-count reductions, not measured runtime improvements.
Correctness scenarios remain in focused specifications and small fixtures.

The ordinary sweep no longer constructs 20,000 `.nx/cache` directories.
The historical candidate recorded zero directory calls within that fixture.
Removing its construction reduces diagnostic setup, but does not explain the
historical product latency. A rejecting filesystem test in
[inspection read-view test](../../../packages/core/workspace-features/src/inspection/read-view.test.ts) guards irrelevant Nx
traversal deterministically.

## Implementation evidence

The [satisfied-install test](../../../packages/core/workspace-features/src/lifecycle/install/satisfied-install.test.ts) counts materialization, settings declaration, and
accepted-resolution recording. A satisfied Registry Skill performs zero of
each. Missing canonical content, drift, missing native projection, changed
constraints, and forced reinstall retain execution. Forced reinstall can still
finish as a no-op when the resulting bytes are identical.

The shortcut requires fresh accepted identity, canonical integrity, ownership,
and native output evidence. Pack dependency semantics and source distribution
descriptors participate in that proof. Mutable local sources, explicit Hook
configuration, source replacement, authored content, and MCP connection
configuration retain their existing execution paths when the shortcut cannot
establish the full transition contract.

Skill materialization and native observation derive only relevant Skill source
authority. The rejecting-getter test retains accepted and authored sources
without consulting unrelated accepted rows or extension kinds. Existing finite
native-location captures remain the owner of shared path observations. Extending
reuse across writers, closures, or queries is deferred: those boundaries require
fresh ownership and preimage evidence, and this investigation does not establish
that a broader cache would preserve it.

## Final reduced comparison

The baseline report records source `ef3377fb6e89b4a545c9f7f1b1dccd057ff87a16`, fixture 11, `complete: false`, 46 passing samples of 47, and `sourceDirty: true`.

The candidate report records source `61e44ba8869b22906c6554330d222f998661a481`, fixture 11, `complete: false`, 46 passing samples of 47, and `sourceDirty: false`.

Both reports use fixture SHA-256 `d0bb8bd96866509067d65ced684037ca80517f16b1d2bb94de6f7c43449dccc8`. The baseline product is unchanged; its dirty status comes only from applying the identical candidate benchmark harness. The candidate implementation was committed with a clean worktree.

Each table cell shows **baseline → candidate**. Directory and write figures are intercepted API calls; hashing is input bytes; RSS is MiB. Control time excludes counter instrumentation. A dash means unavailable or unsuccessful, not zero.

### Cold configured install

| Fixture          | Control seconds | Diagnostic seconds | Requests  | Archive bodies | Directory calls   | Hash bytes              | Write calls   | Max RSS MiB     |
| ---------------- | --------------- | ------------------ | --------- | -------------- | ----------------- | ----------------------- | ------------- | --------------- |
| 1                | 3.60 → 3.46     | 3.90 → 3.53        | 2 → 2     | 1 → 1          | 9,388 → 9,388     | 13,112 → 13,119         | 50 → 50       | 341.5 → 339.8   |
| 10               | 18.35 → 16.16   | 18.64 → 16.35      | 20 → 20   | 10 → 10        | 65,818 → 65,818   | 210,813 → 210,865       | 329 → 329     | 536.7 → 540.4   |
| 50               | 159.82 → 141.95 | 139.16 → 148.26    | 100 → 100 | 50 → 50        | 320,538 → 320,538 | 3,121,027 → 3,121,279   | 1,569 → 1,569 | 1457.9 → 1899.2 |
| 200              | — → —           | — → —              | — → —     | — → —          | — → —             | — → —                   | — → —         | — → —           |
| 1, large content | 4.01 → 4.24     | 4.26 → 3.76        | 2 → 2     | 1 → 1          | 9,388 → 9,388     | 15,523,903 → 15,523,910 | 50 → 50       | 385.2 → 375.2   |

### Warm configured install

| Fixture          | Control seconds | Diagnostic seconds | Requests | Archive bodies | Directory calls  | Hash bytes              | Write calls | Max RSS MiB     |
| ---------------- | --------------- | ------------------ | -------- | -------------- | ---------------- | ----------------------- | ----------- | --------------- |
| 1                | 3.60 → 2.59     | 3.62 → 2.23        | 2 → 0    | 0 → 0          | 6,015 → 3,310    | 12,710 → 12,492         | 20 → 9      | 332.7 → 329.1   |
| 10               | 17.11 → 5.44    | 15.60 → 5.82       | 20 → 0   | 0 → 0          | 41,347 → 13,866  | 161,210 → 117,704       | 119 → 9     | 526.9 → 468.0   |
| 50               | 147.46 → 40.77  | 150.74 → 39.75     | 100 → 0  | 0 → 0          | 210,067 → 64,666 | 1,720,846 → 585,308     | 559 → 9     | 2117.1 → 2031.6 |
| 200              | — → —           | — → —              | — → —    | — → —          | — → —            | — → —                   | — → —       | — → —           |
| 1, large content | 3.04 → 2.99     | 4.17 → 2.41        | 2 → 0    | 0 → 0          | 6,031 → 3,318    | 12,727,297 → 16,789,726 | 20 → 9      | 366.9 → 336.6   |

### Ordinary list

| Fixture          | Control seconds | Diagnostic seconds | Requests | Archive bodies | Directory calls | Hash bytes | Write calls | Max RSS MiB   |
| ---------------- | --------------- | ------------------ | -------- | -------------- | --------------- | ---------- | ----------- | ------------- |
| 1                | 2.29 → 1.98     | 2.86 → 1.91        | 1 → 0    | 0 → 0          | 3,327 → 1,219   | 0 → 0      | 0 → 0       | 326.2 → 319.0 |
| 10               | 2.64 → 1.82     | 2.80 → 2.14        | 10 → 0   | 0 → 0          | 3,419 → 1,241   | 0 → 0      | 0 → 0       | 357.0 → 322.8 |
| 50               | 3.96 → 2.42     | 4.06 → 2.33        | 50 → 0   | 0 → 0          | 3,779 → 1,321   | 0 → 0      | 0 → 0       | 363.1 → 337.8 |
| 200              | — → —           | — → —              | — → —    | — → —          | — → —           | — → —      | — → —       | — → —         |
| 1, large content | 2.04 → 1.81     | 2.35 → 1.68        | 1 → 0    | 0 → 0          | 3,338 → 1,223   | 0 → 0      | 0 → 0       | 328.6 → 320.0 |

### Provenance and incomplete scale results

The primary [baseline report](baseline-fixture11.json) and
[candidate report](candidate-fixture11.json) each contain 46 passing samples
followed by a timed-out control-mode 200-package cold install. The unchanged
600,000 ms command limit produced elapsed times of 600,228.11 ms and
600,224.35 ms respectively, with exit 137 and `timedOut: true`. Neither campaign
completed. Their downstream 200-package warm/list and diagnostic measurements
are unavailable; an incomplete cold setup is not used as a warm-install fixture.

The existing one-package selection was then run serially on baseline and
candidate to reach the separate large-content workload. The
[supplemental baseline](baseline-small-fixture11.json) and
[supplemental candidate](candidate-small-fixture11.json) preserve those raw
runs, each complete with all 40 samples passing, including the repeated small
correctness diagnostics. Tables use the
primary reports for package-count rows and supplemental reports only for
large-content rows. Repeated small samples are not averaged or selected for a
better result.

All runs used the same fixture and instrumentation, on the same Linux x64
shared host, with pinned tools. Baseline ran before candidate in each pair;
no local verification workflow competed with benchmark timing. The complete
supplemental reports record host and toolchain details. Baseline product code
was unchanged at `ef3377fb6e89b4a545c9f7f1b1dccd057ff87a16`; only
`benchmarks/lifecycle.ts` and `benchmarks/lifecycle-preload.cjs` differed from
that revision to apply the identical harness. The other two hashed harness
files already matched. The measured candidate commit remains in this change's
history before this evidence-only commit.

After installing pinned dependencies, each worktree ran the published workflow:

```bash
export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false NX_PARALLEL=1
export TMPDIR=/var/tmp/accepted-graph-tests
CI=true VITEST_MAX_WORKERS=1 AXM_BENCHMARK_SUITE=lifecycle \
  AXM_BENCHMARK_SIZES=1,10,50,200 \
  AXM_LIFECYCLE_BENCHMARK_OUTPUT=/tmp/lifecycle-report.json \
  mise exec -- pnpm run bench
```

The supplemental command selected `AXM_BENCHMARK_SIZES=1` and a separate output
path. It did not raise the timeout, alter product code, or change the fixture.

### Interpretation

The one-package large-content warm install increases hash input from 12,727,297
to 16,789,726 bytes (31.9%), while requests fall from two to zero and write
calls from 20 to nine. The shortcut still performs fresh integrity checks; the
measured hashing regression remains a limitation, not an eliminated cost.

At 50 packages, diagnostic warm install eliminates all 100 Registry requests,
reduces directory API calls from 210,067 to 64,666 (69.2%), hash input from
1,720,846 to 585,308 bytes (66.0%), and write API calls from 559 to nine (98.4%).
The remaining process-wide writes do not contradict the focused proof of zero
materialization, declaration, and accepted-resolution recording. Ordinary list
eliminates 50 Registry requests and reduces directory calls from 3,779 to 1,321;
it continues to hash and write zero bytes/calls in this workload.

Warm install's 50-package control time was 147.46 → 40.77 seconds and its
instrumented time 150.74 → 39.75 seconds. These are individual observations,
not a fixed speedup or latency promise. Its diagnostic maximum RSS was
2,117.1 → 2,031.6 MiB; this does not establish retained-heap behavior.

Cold acquisition has no comparable work-count reduction: at 50 packages both
revisions record 100 requests, 320,538 directory calls, and 1,569 write calls.
Its instrumented time regressed from 139.16 to 148.26 seconds, and maximum RSS
increased from 1,457.9 to 1,899.2 MiB, while control time improved from 159.82 to
141.95 seconds. The mixed timing and memory results remain visible; this change
does not establish a cold-install or general memory improvement. Further cold
acquisition or memory optimization requires separate profiling rather than an
inferred cache or concurrency change.

SHA-256 checksums of the final report bytes:

```text
ac7f276134ee58aa65e60d53beef257a470a7f316fb04c10d3dab9ead55beab4  baseline-fixture11.json
211b6f8df8c60a81b2465f652b42e6783531950ba4cc40e798be08a2d812a7f9  candidate-fixture11.json
061af9acb31f8a82ea3c892370de53db5502fcefd4809b92893fd6fe5e641471  baseline-small-fixture11.json
5d2aecd183defe6f1123b5aca61816754c1c27322caeafa750033356ac5121cd  candidate-small-fixture11.json
```

## Local verification and specification impact

The integrated implementation passed `pnpm run verify:affected` and
`pnpm run verify:pr` before measurement. Relevant owner results were 2,229
kernel tests, 137 kind tests, 3,164 feature tests, 3,537 CLI tests, 72 architecture
tests, and 512 script tests. The PR workflow passed 572 main E2E tests, 14 binary
smoke tests, and three installer tests, plus source, toolchain, dependency,
generated-output, and artifact checks. Three kernel filesystem cases, one
opt-in live Registry feature smoke, and three ledgered/opt-in E2E cases were
skipped. Windows execution is left to the repository CI gate.

An E2E failure during verification exposed missing agent coverage in a repeated
Pack install's satisfied member artifacts. A focused test reproduced it before
the correction; the corrected test verifies both retained coverage and zero
materialization. The focused E2E and both final gates passed afterward.

A later local CLI run timed out in the existing 20-second Subagent sync test.
The isolated retry also timed out. After task-only disposable temporary data
was removed from the nearly full shared host, the unchanged case and final
full gates passed. Neither code nor its timeout was changed to obtain that
result; the cleanup alone is not established as the cause. The retained field
note records those observations.

`axm:specification-verdict --args='--base origin/main'` rendered 17 contract
impact rows. The two removed ordinary-list identities have explicit successor
lineage. The remaining rows cover accepted-graph planning, install idempotence,
activation, synchronization/removal, lock recovery/schema, acquired Pack
validation, and unknown-membership safety. Some cached kernel/feature receipts
were labeled `stale / passed` after the repository-wide source fingerprint
changed with a field note, although the owning input-bound Nx targets and final
local gates passed. Rendering exit zero is not a claim that every receipt was
fresh. Public CI verifies the final submitted revision separately.

## Historical exhaustive campaign

These exact-byte reports predate integration and the reduced fixture. They are
not final-candidate evidence and cannot provide a direct comparison with
fixture 11.

| Report                                                                | Source revision                            | Completion                                            |
| --------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| [Historical candidate](historical-candidate-fixture10.json)           | `1f75105e665780312aeab49d14348e4188f640ea` | 106 passed samples                                    |
| [Historical baseline](historical-baseline-fixture10-interrupted.json) | `e6f4479d5536f62b23140cbbc89d1b0d60000043` | 17 passed samples, one interrupted sample; incomplete |

The interrupted baseline sample does not establish a product failure. Two
earlier incomplete baseline reports preserve an actual failed update on
`e6f4479d5536f62b23140cbbc89d1b0d60000043`: [fixture 6](historical-baseline-fixture6-failed.json)
and [fixture 7](historical-baseline-fixture7-failed.json). Each contains 46
samples and ends at control-mode size-10 `changed-version-update`, with exit 1,
`timedOut: false`, and a partial outcome (10 committed closures, two failed).
These are evidence about their recorded old revision and fixtures, not a claim
that the current main baseline has the same failure. Their original diagnostic
instrumentation and units are retained without retroactive correction.

The historical candidate's timed commands totaled 272.69 minutes, of which
247.46 minutes were at 200 packages. That old size-200 fixture combined package
count, large content, and the irrelevant tree. Its instrumented warm install
recorded 1,025,003 directory API calls, 40,301,378 hash-input bytes, and 1,809
write API calls; `.nx/cache` accounted for zero directory calls. The same
fixture's ordinary list recorded 1,587 directory calls and zero hashing/writes.

SHA-256 checksums of the retained report bytes:

```text
ea883f164acd4313be3f1ae758e62cb144e85e6f238cc4b50fda16a107a5598d  historical-baseline-fixture6-failed.json
55567979ee1940c1ac7b9a6be2a522ce261181725dea0683c435f1678bf3bea7  historical-baseline-fixture7-failed.json
2056f0be011fc3e27647392b9cae634d273c2ff86c6a01b25f3e38222d3411ac  historical-candidate-fixture10.json
9a57dbe232134a74ec9c1ebe985bb21ea99dd10e9f672fb7ce9ce40455b2055c  historical-baseline-fixture10-interrupted.json
```

## Measurement limits

Filesystem counters count intercepted API calls, not physical I/O. Hash bytes
count `Hash.update` inputs. Instrumented maximum RSS is the Node process
high-water mark converted from KiB to bytes, not retained heap. Control runs
omit diagnostic preloading; their unavailable counters remain unavailable.
Closure-attributed writes and lock-wait time are not exposed by this runner.

Cold and warm describe logical workspace and archive-cache state. OS caches
are uncontrolled, and shared-host timing is not a fixed speedup guarantee.
Setup is outside command timing. Each comparison row uses one sample per mode. The supplemental runs repeat
small scenarios to reach large-content cases; they are not a designed variance
study. These reports do not characterize variance or tail latency.
