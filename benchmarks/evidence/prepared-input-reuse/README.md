# Prepared-input reuse evidence

This ledger records the before/after evidence for the change that shares
prepared inputs across the CLI: within one invocation, commands read, parse,
hash, render and resolve the same workspace inputs fewer times, while every
fresh conflict, identity, rollback, integrity and post-write check stays. It
separates what was measured from what was inferred, and keeps the failures and
limits beside the results.

The [accepted specification catalog](../../../specifications/catalog.md) and
the [specification contract](../../../contributing/guides/executable-specifications.md)
own requirements. This record creates and waives none; the change alters no
accepted specification. The [tracing guide](../../../contributing/guides/local-tracing.md)
owns the campaign procedure. The route, mode and owner mapping that says which
owner each command reaches, what changed there and what repeated work stays is
the checked [prepared-input allocation](../../../apps/cli/src/test-support/prepared-input-allocation.json),
reconciled against the registered command tree by
[its test](../../../apps/cli/src/root/shared/prepared-input-inventory.test.ts).

## What this evidence establishes

- **Behavior equality, with one failed check.** For 260 benchmark scenarios,
  untraced and with summary and detail tracing, 780 checks were due and 777
  verified that the old and the new binary produce the same output, exit code,
  machine progress and resulting state. One check failed on a diagnostic
  record that contains the source line of a failure site the change moved, and
  the harness therefore did not run that scenario's two traced checks (see
  [Behavior equality](#behavior-equality)).
- **Less physical work.** Kernel recordings of the untraced invocations show
  33.2% fewer file calls over the 260 scenarios (2,866,218 → 1,913,453). On
  paths outside `/proc`, `/sys` and `/dev`, 241 scenarios make fewer calls, 19
  make the same number, and none makes more. One added failed open per
  invocation remains in two MCP scenarios.
- **Less logical work.** Trace work totals fall for canonical-path
  resolutions (−60.1%), native configuration parses (−65.8%), settings parses
  (−29.1%), lockfile parses (−40.0%) and receipt hashes (−76.5%). Seven work
  kinds rise in total; each was traced to its cause and is not added work (see
  [Counters that rose](#counters-that-rose)).
- **The predeclared deltas.** Of 581 work deltas stated before
  implementation, 423 are met or beaten, 18 fall short for recorded reasons,
  and 140 cannot be measured from this campaign (122 of those are asserted by
  an owner-level count test; 18 have no direct count).
- **Elapsed time** was observed in paired blocks on a shared, non-isolated
  host for 259 scenarios: the new binary's median is lower in 214 of them and
  in 8 of the 9 that take a second or more, and the sum of medians falls 11.8%.
  Two summary-tracing budget verdicts failed in the campaign and are retained;
  on the idle host the new binary meets both, and the old binary alone exceeds
  both. This is not a qualified performance result.
- **Peak memory** is unchanged in the median, with one material increase: the
  50-extension restore peaks 42.5 MiB (8.9%) higher. A heap sampler attributes
  about half of it to state the change shares within an invocation; the rest is
  not attributed (see
  [Paired elapsed time and peak RSS](#paired-elapsed-time-and-peak-rss)).

It does not establish isolated-host performance, behavior on macOS or Windows,
anything about concurrent foreign edits, or that no unrecorded repeated work
remains: concurrent edits are owned by the focused owner tests each allocation
entry cites, and the allocation's reach is stated under [Limits](#limits).

## Provenance

| Item                    | Value                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old revision            | `ada862c27244a484c650243d912e90b3346ee3a4` (main before this change), clean                                                                                                         |
| Old binary SHA-256      | `49d3cb7b3c79249fbffa0a43e9a1c8267feb610c61a54c0ba6cbbf37939cb8c6`                                                                                                                  |
| New revision            | `15cac0d07585f4f2a44f3497d0777229afff1087` (last product commit of this change), clean                                                                                              |
| New binary SHA-256      | `5ea26bfd0f5bff40c5036882368487ea1eaa52b4d52b831ad97470a98195d15d`                                                                                                                  |
| Build                   | `pnpm exec nx run cli:compile-host` in a clean checkout of each revision; the new binary's build reused cached outputs of unchanged dependency tasks and compiled the binary itself |
| Harness                 | The same benchmark harness for every retained run; module-closure SHA-256 `59eaa2df4862f77fea59373f8674bd73b77e042e8fda6f2d79b3694b767958d9`                                        |
| Dependency lock SHA-256 | `5244a44ea2a95abfaa496f08c935f42a0e2e30734e6975073b53124fcd99eb92`                                                                                                                  |
| Budgets SHA-256         | `c2bd287fb786a6294507465201cfad8f499217bcbab4174ab08f0afa05fb9dbf` (unchanged thresholds)                                                                                           |
| Host                    | Linux 6.12.115 x64, AMD EPYC 9554P, 16 CPUs, 62.8 GiB; isolation not declared                                                                                                       |
| Trace receiver          | Loopback Seq `2026.1.02662`, pinned client                                                                                                                                          |
| Kernel capture          | `strace` 6.8, `-f -qq -y`, fixed file-syscall set                                                                                                                                   |
| Date                    | 2026-11-16 (UTC)                                                                                                                                                                    |

The change sits directly on the old revision. The commits after the new
revision add the allocation and this ledger; they change no product source.
The tree measured is `f8da15793d7d5b16f06d2272ead25ba07b53db51`.

Every campaign ran through the published benchmark workflow, inside a private
mount namespace that binds an empty directory over the account's
`.axm-runtime` directory, as the tracing guide requires when other AXM
processes share the account. The host is shared and not isolated. During the
old-versus-new fixture run another worktree of the same account ran one short
test target and read-only analysis; during the old-versus-old run a read-only
analysis of the recordings ran; the timing chunks, the confirmation runs and
the heap-sampler run had no other workload of this account.

```bash
export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false NX_DAEMON=false
AXM_BENCHMARK_SUITE=observability AXM_OBSERVABILITY_RUN=fixtures \
  AXM_OBSERVABILITY_PHYSICAL_WORK=strace \
  AXM_OBSERVABILITY_BASELINE_MANIFEST=<old manifest> \
  AXM_OBSERVABILITY_CANDIDATE_MANIFEST=<new manifest> \
  AXM_OBSERVABILITY_OUTPUT=<fresh directory> \
  <isolation wrapper> pnpm run bench
```

### Runs

| Run                         | Mode                                              | Subjects (baseline → candidate) | Scenarios | Result                                                                                                                                 |
| --------------------------- | ------------------------------------------------- | ------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| Old versus new              | Fixtures, with kernel capture                     | old → new                       |       260 | **Failed** one check: 777 of 780 checks verified, 1 failed, 2 not run; 518 of 520 traces inspected                                     |
| Old versus old              | Fixtures                                          | old → old                       |       260 | 780 of 780 checks verified                                                                                                             |
| Paired timing, eight chunks | Compare, memory informational, noise under review | old → new                       |       259 | 259 of 259 scenarios timed; 777 of 777 preflight checks verified; two chunks retain one failed budget verdict each                     |
| Unused timing attempts      | Compare                                           | old → new                       |   33 each | Chunk 5 twice stopped in preflight on the failing scenario and collected no timing; a retry of chunk 6 collected everything and passed |
| Confirmation, idle host     | Compare, two scenarios                            | old → new                       |         2 | Separate observation: assessment passed                                                                                                |
| Confirmation, idle host     | Compare, two scenarios                            | old → old                       |         2 | Separate observation: the old binary alone exceeds the summary budget in both scenarios                                                |
| Heap sampler                | Compare, one scenario, diagnostic heap sampling   | old → new                       |         1 | 12 untraced invocations per binary; the report is not retained, its summary is                                                         |

The old-versus-old run exists only to obtain the old binary's trace work under
the same harness, since a fixtures run traces its candidate. Kernel recordings
of both binaries come from the old-versus-new run.

The check of the predeclared deltas and the explanations of rising counters
were made before the retained old-versus-old run. They read the old binary's
trace work from an earlier old-versus-old run, made under an earlier revision
of the harness module closure with a binary built from main six commits
before the old revision (a release, Knowledge diagnostics and titles, and
release-verification and CI selection changes). Compared by work kind, that
run and the retained one are identical in 258 of 260 scenarios; in the 10- and
50-extension restores they differ by at most 10 occurrences of `axm.io.stat`
and `axm.native.lock-io`. The three delta statements that read `axm.io.stat`
in those two scenarios are all better than expected by far more than that (for
example −940 and −4,540 against −200 and −1,000 expected). The tables in this
ledger use the retained run.

## Behavior equality

Fixture mode runs each scenario's old binary untraced and the new binary
untraced, with summary tracing and with detail tracing, and compares output,
exit code, schema-validated machine progress, independent Registry, archive,
authentication and executable records, the resulting filesystem state and
native receipts under the comparison rules of the tracing guide. The 260
scenarios are the full current inventory: 159 registered route defaults, 81
previews, one additional lint repair, seven startup outcomes and 12 risk
paths. Of the 780 checks due, 777 are verified equal.

**One check failed.** `installed/adopt-enabled-native-refusal`, untraced,
fails on the resulting-state digest. Its stdout digest, stderr digest and exit
code (10) are equal for both binaries. The state differs in one file, the
adoption diagnostic record under the AXM home diagnostics directory. That
record contains the source position of the failure site
(`failure.frames[].line` and the line numbers inside the cause stacks). The
site is in `packages/core/extension-kinds/src/skills/materialization.ts`,
which the change edited, so the position moved from line 280 to line 355.
Compared field by field, the two records differ only in `eventId`,
`invocationId`, `occurredAt`, `failure.history[].elapsedMs`,
`failure.frames[].line` and `causes[].stack`; after projecting the event id,
the invocation id, the timestamp, the elapsed times and that source line, they
are equal. The harness projects ids and times but not source positions, so any
edit above that line in that file makes this check fail between two builds.
The failed check stands in the retained report.

Because that mode failed, the harness did not run the scenario's summary and
detail modes (two checks not run). The scenario has kernel recordings for both
binaries but no trace work for the new binary, and it could not be timed: the
harness refuses to time a scenario whose behavior check failed. The same
failure repeated in both attempts of timing chunk 5 (97 checks each, 96
verified), which is why that chunk was run again without the scenario.

The 50-extension restore retains 1,446 summary spans against the limit of
2,048 (1,245 with the old binary; the difference is 101 read phases, 100 of
them the fresh post-write phases described below, and the 100 desired-state
evaluations those phases count).

## Kernel-observed physical work

Product trace counters carry no operands, so they cannot show one path being
read twice. The kernel recordings can. Each scenario's untraced old and new
invocation ran under `strace`, and the harness reduced each recording to
per-path counters for the whole process tree, child processes such as `git`
included. This is not timing evidence.

### Kernel-observed file calls, summed over all 260 scenarios

| Call                        |           Old |           New |     Change |
| --------------------------- | ------------: | ------------: | ---------: |
| **All recorded file calls** | **2,866,218** | **1,913,453** | **-33.2%** |
| `write`                     |     1,375,954 |       873,650 |     -36.5% |
| `openat`                    |       450,450 |       330,942 |     -26.5% |
| `readlink`                  |       422,188 |       300,271 |     -28.9% |
| `statx`                     |       400,042 |       208,527 |     -47.9% |
| `access`                    |        66,841 |        60,759 |      -9.1% |
| `read`                      |        65,893 |        58,983 |     -10.5% |
| `getdents64`                |        59,412 |        56,688 |      -4.6% |
| `ftruncate`                 |         5,543 |         5,530 |      -0.2% |
| `mkdir`                     |         3,474 |         3,463 |      -0.3% |
| `unlink`                    |         3,436 |         1,838 |     -46.5% |
| `unlinkat`                  |         2,270 |         2,171 |      -4.4% |
| `rmdir`                     |         1,983 |         1,980 |      -0.2% |
| `rename`                    |         1,785 |         1,782 |      -0.2% |
| `newfstatat`                |         1,698 |         1,694 |      -0.2% |

### Content-read opens of workspace documents, summed over all 260 scenarios

| Document                   |   Old |   New | Change |
| -------------------------- | ----: | ----: | -----: |
| extension manifests        | 4,454 | 4,061 |  -8.8% |
| axm.json                   | 3,586 | 2,813 | -21.6% |
| axm.lock                   | 2,981 | 2,090 | -29.9% |
| SKILL.md                   |   789 |   674 | -14.6% |
| projection-containers.json |   298 |   262 | -12.1% |
| native agent configuration |   285 |   241 | -15.4% |
| AGENTS.md                  |   180 |   139 | -22.8% |

Scenarios in which the new binary makes more recorded file calls in total: 0.
Counting per-path calls outside `/proc`, `/sys` and `/dev` only (old 1,181,501, new 833,770, -29.4%): scenarios with more calls in the new binary: 0; with identical counts: 19.
Per-scenario reduction in recorded file calls: median 13.9%, largest 74.6%, smallest 0.0%.

### Selected scenarios (old → new)

| Scenario                                 |          File calls | `axm.json` reads | `axm.lock` reads | Settings parses | Lockfile parses | Native config parses | Canonical-path resolutions |
| ---------------------------------------- | ------------------: | ---------------: | ---------------: | --------------: | --------------: | -------------------: | -------------------------: |
| `local/setup`                            |     14,848 → 12,019 |          13 → 12 |            8 → 7 |          10 → 9 |           6 → 5 |                0 → 0 |                  561 → 440 |
| `typed/knowledge/new`                    |       7,484 → 5,463 |          53 → 30 |          40 → 20 |         43 → 20 |         36 → 16 |                0 → 0 |                  272 → 200 |
| `typed/hooks/new`                        |       8,286 → 6,266 |          33 → 28 |          20 → 12 |         18 → 13 |          16 → 8 |                0 → 0 |                  315 → 231 |
| `typed/hooks/install`                    |     22,629 → 15,585 |          38 → 31 |          37 → 24 |         28 → 21 |         28 → 15 |               20 → 9 |                  918 → 495 |
| `typed/hooks/uninstall`                  |     37,496 → 24,264 |          41 → 35 |          16 → 16 |         31 → 25 |           7 → 7 |             113 → 25 |                1,655 → 612 |
| `typed/subagents/install`                |     26,042 → 19,436 |          26 → 24 |          23 → 18 |         17 → 15 |         15 → 10 |                0 → 0 |                1,105 → 627 |
| `typed/mcps/add`                         |      13,316 → 8,417 |          14 → 13 |            4 → 4 |           6 → 5 |           2 → 2 |                9 → 7 |                  744 → 270 |
| `typed/packs/install`                    |     16,081 → 12,958 |          26 → 24 |          26 → 21 |         16 → 14 |         17 → 12 |                0 → 0 |                  596 → 453 |
| `typed/skills/handoff`                   |     31,167 → 22,374 |          25 → 23 |          21 → 17 |         16 → 14 |          13 → 9 |                0 → 0 |                1,362 → 687 |
| `installed/uninstall`                    |     35,780 → 20,984 |          30 → 28 |          16 → 16 |         20 → 18 |           7 → 7 |                4 → 2 |                1,854 → 594 |
| `typed/migrate`                          |     30,590 → 14,992 |          41 → 37 |          19 → 18 |         29 → 26 |           8 → 8 |                4 → 2 |                1,616 → 439 |
| `local/lint-fix`                         |     19,164 → 13,011 |          43 → 39 |          41 → 37 |         42 → 37 |         40 → 35 |                1 → 1 |                  932 → 369 |
| `typed/publish`                          |       1,192 → 1,061 |            8 → 6 |            6 → 6 |           5 → 3 |           3 → 3 |                0 → 0 |                    24 → 24 |
| `installed/verify`                       |           279 → 262 |            2 → 1 |            0 → 0 |           2 → 1 |           0 → 0 |                0 → 0 |                      2 → 2 |
| `auth/login`                             |           353 → 326 |            2 → 1 |            0 → 0 |           2 → 1 |           0 → 0 |                0 → 0 |                      2 → 2 |
| `registry/1/sync-restore/cold/baseline`  |     23,101 → 16,372 |          23 → 16 |          23 → 15 |         18 → 12 |         18 → 11 |                3 → 3 |                  913 → 343 |
| `registry/10/sync-restore/cold/baseline` |   168,429 → 107,131 |         140 → 97 |         158 → 87 |        108 → 66 |        126 → 56 |                3 → 3 |              7,888 → 2,440 |
| `registry/50/sync-restore/cold/baseline` | 1,062,840 → 754,318 |        660 → 457 |        758 → 407 |       508 → 306 |       606 → 256 |                3 → 3 |            48,688 → 21,560 |
| `registry/1/sync-restore/warm/baseline`  |     23,083 → 16,365 |          23 → 16 |          23 → 15 |         18 → 12 |         18 → 11 |                3 → 3 |                  913 → 343 |

The 19 scenarios with identical product-path calls are group help nodes,
`help` and `schema`, which do not run inside the command runtime; 13 of them
also have identical totals. Some individual syscall totals still rise in
scenarios whose product paths all fall: `installed/check` reads 129 → 130, and
`typed/subagents/check` reads 124 → 126 and opens 850 → 851. Both come from the
runtime's own `/proc/<pid>/statm` sampling.

Per-path counters outside `/proc`, `/sys` and `/dev` rise in 13 scenarios on
nine paths. All but one are naming, timing or one-for-one swaps; one is an
added failed open:

| Counter                                                                                   | Scenarios | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/proc/<pid>/statm`, `/proc/<pid>/maps` and `/sys/devices/system/cpu/online` reads        | many      | Runtime memory and thread-pool sampling. `maps` bytes rise in 259 scenarios because the new binary's path is five characters longer and appears on six mappings; `statm` opens rise in 17 scenarios and fall in 186                                                                                                                                                                                                                                                  |
| `openFailed` on `<ws>/native/hook-bundle.json`                                            | 2         | Hook import reads its optional metadata once instead of probing then reading: one `access` became one failed open                                                                                                                                                                                                                                                                                                                                                    |
| `openFailed` on `<home>/.cache/axm/update-check.json`                                     | 2         | The startup update check reads the cache with one read-if-present read: one `access` became one failed open                                                                                                                                                                                                                                                                                                                                                          |
| `openFailed` on `<ws>/.mcp.json/mcp.json`                                                 | 2         | **Added.** The MCP manifest reader now reads `mcp.json` under each candidate root before probing. Under the file `<ws>/.mcp.json` the read fails with `ENOTDIR`, which is not "not found", so the existing probe still runs to keep diagnostics unchanged. In `typed/mcps/check` fewer probes of the Registry package's manifest offset it; in `typed/mcps/show` nothing at that owner offsets it, and the scenario's recorded calls fall only through other changes |
| Counters on `<ws>/axm.json.tmp.<suffix>` and `<ws>/axm.lock.tmp.<suffix>`                 | 1         | Staged writes carry a random suffix the path projection does not mask; the old binary's equally sized temporaries fall by the same counts (213 and 601 bytes)                                                                                                                                                                                                                                                                                                        |
| `pathOpens` on the new binary's own path                                                  | 3         | Self-update scenarios resolve the running executable; the old binary's path falls by the same count                                                                                                                                                                                                                                                                                                                                                                  |
| `directoryReads` on the system temporary directory                                        | 1         | Both binaries scan it the same number of times; the shared directory held one more entry when the new binary ran, which needed one more `getdents64` buffer                                                                                                                                                                                                                                                                                                          |
| `stats` on one cached archive in each of the 10- and 50-extension restores (1 → 2, 3 → 4) | 2         | Automatic archive-cache prune scans depend on concurrent commit order: in the 10-extension restore the archive was renamed into place just before a prune listing instead of just after (archive stats 22 → 23 in total); in the 50-extension restore total archive stats fall 365 → 363                                                                                                                                                                             |

## Trace work

Trace work is the product's own accounting by work kind and owner span, from
the summary traces of the old binary (old-versus-old run) and of the new
binary (old-versus-new run), over the 259 scenarios that have trace work for
both binaries.

### Trace work kinds with a lower total in the new binary (259 scenarios with trace evidence)

| Work kind                          |     Old |     New | Change |
| ---------------------------------- | ------: | ------: | -----: |
| `axm.native.canonical-path`        | 129,480 |  51,618 | -60.1% |
| `axm.io.real-path`                 | 203,043 | 169,357 | -16.6% |
| `axm.io.stat`                      | 131,196 |  98,305 | -25.1% |
| `axm.io.read-link`                 | 217,887 | 189,278 | -13.1% |
| `axm.io.access`                    |  64,189 |  58,134 |  -9.4% |
| `axm.io.read-file`                 |  22,940 |  19,638 | -14.4% |
| `axm.io.read-directory`            |  52,271 |  49,475 |  -5.3% |
| `axm.io.remove`                    |   2,385 |     714 | -70.1% |
| `axm.parse.lockfile`               |   2,198 |   1,319 | -40.0% |
| `axm.parse.lockfile-decode`        |   2,198 |   1,319 | -40.0% |
| `axm.parse.settings`               |   2,625 |   1,862 | -29.1% |
| `axm.parse.native`                 |     999 |     342 | -65.8% |
| `axm.io.lstat`                     |   2,051 |   1,469 | -28.4% |
| `axm.hash.preimage`                |   1,217 |     999 | -17.9% |
| `axm.hash.receipt`                 |     238 |      56 | -76.5% |
| `axm.hash.materialized-tree`       |     494 |     323 | -34.6% |
| `axm.parse.settings-round-trip`    |     272 |     146 | -46.3% |
| `axm.hash.content`                 |     662 |     541 | -18.3% |
| `axm.admission.buffered-archive`   |     185 |     105 | -43.2% |
| `axm.io.file-read`                 |     574 |     514 | -10.5% |
| `axm.parse.lockfile-round-trip`    |      75 |      38 | -49.3% |
| `axm.io.open`                      |     465 |     435 |  -6.5% |
| `axm.subagent.prepare`             |      46 |      20 | -56.5% |
| `axm.subagent.compile`             |      46 |      20 | -56.5% |
| `axm.admission.transaction-ledger` |   1,676 |   1,652 |  -1.4% |
| `axm.hash.package`                 |     176 |     157 | -10.8% |
| `axm.subagent.decode-manifest`     |      56 |      39 | -30.4% |
| `axm.native.lock-io`               |   8,022 |   8,007 |  -0.2% |
| `axm.io.write-file`                |   3,484 |   3,474 |  -0.3% |
| `axm.archive.parse`                |     130 |     120 |  -7.7% |
| `axm.io.make-directory`            |   1,308 |   1,302 |  -0.5% |
| `axm.parse.receipts`               |     234 |     228 |  -2.6% |
| `axm.parse.manifest`               |      55 |      50 |  -9.1% |
| `axm.archive.read-member`          |     226 |     222 |  -1.8% |
| `axm.io.chmod`                     |     384 |     380 |  -1.0% |
| `axm.publish.file`                 |   1,592 |   1,589 |  -0.2% |
| `axm.wait.file-lock`               |     193 |     190 |  -1.6% |
| `axm.native.lock-release`          |   1,584 |   1,581 |  -0.2% |
| `axm.native.lock-acquire`          |   1,584 |   1,581 |  -0.2% |
| `axm.io.rename`                    |   1,715 |   1,712 |  -0.2% |
| `axm.publish.document`             |     124 |     122 |  -1.6% |
| `axm.render.settings`              |      85 |      83 |  -2.4% |
| `axm.io.make-temp-directory`       |     255 |     253 |  -0.8% |
| `axm.wait.document-writer`         |     215 |     213 |  -0.9% |
| `axm.admission.extraction`         |     106 |     104 |  -1.9% |
| `axm.archive.external-extract`     |     106 |     104 |  -1.9% |
| `axm.archive.extraction`           |     106 |     104 |  -1.9% |
| `axm.archive.external-decode`      |     106 |     104 |  -1.9% |
| `axm.hash.execution-candidate`     |     185 |     183 |  -1.1% |

### Trace work kinds with a higher total in the new binary

| Work kind                         |     Old |     New | Scenarios rising |
| --------------------------------- | ------: | ------: | ---------------: |
| `axm.observation.reuse`           | 146,877 | 222,437 |                5 |
| `axm.resolve.desired-state-reuse` |   1,608 |   1,855 |               51 |
| `axm.observation.phase`           |     447 |     638 |               57 |
| `axm.render.native`               |       0 |     161 |               43 |
| `axm.resolve.desired-state`       |     307 |     445 |               35 |
| `axm.archive.integrity`           |      68 |     142 |               27 |
| `axm.registry.metadata-reuse`     |      60 |      76 |               16 |

Work kinds with an identical total: 144 of 204.

### Counters that rose

Each rise, including `axm.hash.content`, whose total falls but which rises in
five scenarios, and the kernel per-path counters above, was explained from the
commits and the traces by one analysis and then challenged by a second, which
re-measured cited and uncited scenarios. All nine mechanisms were confirmed and
none was judged a regression. For the kernel per-path counters the second
reading rejected the classification "naming or timing variation" for the
subject as a whole, because two of its rises are syscall-kind swaps and one is
the added failed open described above; it also corrected the first reading,
which had the failed open offset in `typed/mcps/show` as well.

**`axm.observation.phase`, 447 → 638, deliberate.** One span per read-phase
lifetime or join; it counts no reads. 57 scenarios rise and none falls: fresh
phases rise by 166 and reuse joins by 25. Of the fresh phases, 128 are the
post-write checks of the six sync-restore and cold-sync scenarios, each of
which now runs in one fresh read phase opened after the last write, two per
restored closure (100 in the 50-extension restore). The rest come from readers
that now share one phase: authored and install preflights, instruction
management, Knowledge queries, lint and visibility, and sync validation; the
added apply-phase phase in three enable scenarios is most likely a post-write
check too, but no owner span names its call site. In every rising scenario
settings and lockfile parses are equal or lower and kernel reads of `axm.json`
fall.

**`axm.resolve.desired-state`, 307 → 445, newly counted.** One span per
desired-state evaluation made through a read phase; the live reader used
outside a phase emits none, in both binaries. The new phases bring
evaluations the old binary ran uncounted on live readers into a phase, where
each phase counts its evaluation once and serves repeats from its memo. It
rises in 35 scenarios and falls in six MCP scenarios. In the 35 rising
scenarios settings parses fall 1,127 → 731, lockfile parses 1,223 → 576, and
kernel reads of `axm.json` 1,568 → 1,165 and of `axm.lock` 1,548 → 895.

**`axm.resolve.desired-state-reuse`, 1,608 → 1,855, requests and reuse
hits.** One occurrence per desired-state request served by a phase's memo,
executed or reused. It rises in 51 scenarios and falls in 58. Across the
rising scenarios requests go 373 → 792, of which executed 80 → 231 (equal to
the counted evaluations) and reused 293 → 561, while lockfile parses fall
1,402 → 679 and settings parses 1,356 → 878.

**`axm.observation.reuse`, 146,877 → 222,437, newly counted.** One span per
filesystem request routed through a phase's shared view, counted in addition
to the `axm.io.*` kind that executes it; one document read records two spans
(text decode and file read). The post-write checks' requests now pass through
a view. Five scenarios rise and 46 fall. In each rising scenario every
executed `axm.io.*` kind is equal or lower and their total falls (50-extension
restore: 271,664 → 243,262), and no workspace, native-output, settings or
lockfile path gains a kernel read, stat, readlink, access or directory read.

**`axm.archive.integrity`, 68 → 142, newly counted.** One SHA-512 hash of a
whole Registry archive. The old binary hashed local Registry archives at sites
that recorded no work, and its callers hashed the same bytes again; the new
binary routes every hash of a Registry archive it reads through one counted
check and skips the caller's repeat when the client's verification covers the
buffer. All 27 rising scenarios go from 0; their counted hashes equal the new
binary's kernel archive reads one for one (74 and 74), and the old binary read
those archives 104 times and hashed at least once per read, partly in the
callers.

**`axm.render.native`, 0 → 161, a new counter for existing renders.** One
render of a native Hook settings document. An apply now renders the document
once instead of once plus once per expected owner already present in the file;
only a dry run renders each owner to report which are current. In none of the
43 rising scenarios does a kernel counter on a Hook target path rise, and
native configuration parses are equal or lower. The old binary has no such
counter, so that renders did not rise is inferred from the code; the target
reads, which are not one per render, support only that direction, not an old
count.

**`axm.registry.metadata-reuse`, 60 → 76, reuse hits.** One Registry
metadata lookup through the invocation's read phase. Executed lookups stay
60 → 60; the 16 added occurrences are reuse hits, one in each typed and
preview publish scenario: a publication preview is now answered from the open
read phase instead of reading the Registry index directly. The kernel shows
one fewer read of that index in each of the 16 scenarios; in typed publishes
the re-read under the publication lock stays.

**`axm.hash.content`, 662 → 541, rising 0 → 1 in five Knowledge concept
scenarios, newly counted.** Knowledge source revisions were hashed without a
counter, in both the capture read and the confirming read; they are now hashed
once after the confirming read, inside a counted span. The counted bytes (261)
equal one copy of the two sources, whose two kernel reads each stay, so the
fresh capture-and-confirm read is kept; from the code, the old binary computed
four hashes over 522 bytes there.

**Kernel per-path counters, 13 scenarios on nine paths.** See the table above:
two syscall-kind swaps, naming of temporaries and the binary path, one host
temporary-directory size effect, one archive-prune ordering effect, and the
one added failed open on `<ws>/.mcp.json/mcp.json` in `typed/mcps/check` and
`typed/mcps/show`.

What stays inferred: the old binary records no work for its unphased
desired-state evaluations, its uncounted archive hashes, its Knowledge source
hashes or its native Hook renders, so their old counts are bounded from
parses, kernel reads and the code, not read from a counter.

## Predeclared deltas

Before implementation, each planned change stated, for named scenarios, a
counter's value before and the value expected after that change alone. All 581
statements were checked against the old-versus-new run and the earlier
old-versus-old run described under [Provenance](#runs), and every result that
was not met or not measurable was rechecked independently, with 12 further
statements spot-checked.

| Outcome                                                      |   Count |
| ------------------------------------------------------------ | ------: |
| Met: the measured value equals the expected value            |     248 |
| Better: lower than expected, because other changes add to it |     175 |
| Not met, explained                                           |      18 |
| Not measurable here, asserted by an owner-level count test   |     122 |
| Not measurable here, no direct count                         |      18 |
| **Total**                                                    | **581** |

The 18 that are not met:

| Scenarios                                                               | Counter                                         | Expected                                       | Measured (old → new)                 | Reason                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typed/hooks/uninstall`, `preview/hooks-uninstall` (5 statements)       | Native settings reads, parses and renders       | −3 reads                                       | −2 reads (20 → 18, 9 → 7)            | The eager-observation handoff was narrowed: the participant observation stays fresh, so uninstall keeps one more settings observation, which is parsed and rendered again; the change's count test asserts −2.                                                                                                                                           |
| `preview/rules-uninstall`, `preview/rules-disable`                      | `AGENTS.md` reads                               | 4, 2                                           | 7 → 5, 5 → 3                         | The same narrowing; the count test asserts the measured value for disable.                                                                                                                                                                                                                                                                               |
| `typed/rules/install`, `typed/rules/new`                                | `AGENTS.md` reads                               | 1                                              | 3 → 3                                | The statement targeted the wrong counter: the file is absent before the write, so the removed observations appear as failed opens (7 → 5 and 7 → 6); the three reads are post-write readback, kept.                                                                                                                                                      |
| `typed/mcps/uninstall`                                                  | `.mcp.json` reads and native parses             | 16, 18                                         | 18 → 17, 26 → 19                     | The statement assumed two removal calls; uninstall makes one, and that call saves what the count test asserts.                                                                                                                                                                                                                                           |
| `local/lint-fix`, `preview/lint` (2 statements)                         | `AGENTS.md` reads                               | 11, 6                                          | 23 → 15, 12 → 10                     | The instruction observation's three reads become one as predicted. The missing reduction is four unchanged pairs of reads by managed-region dry runs that lint's invariant-facts evaluation demands (the Rule and Knowledge regions, inferred from the recorded concurrency and the code), which the predicted change does not cover; no read was added. |
| `local/lint-fix`, `preview/lint` (2 statements)                         | `.git` probes; `.gitignore` stats and readlinks | 2, 1; one strict admission fewer per readiness | 4 → 3, 2 → 1; 7/14 → 7/14, 2/4 → 2/4 | `lint --fix` runs one readiness, not the two the prediction counted, and each saves its Git-root walk. The fixture is not Git-managed and has no `.gitignore`, so no admission existed to remove; the owner count test asserts that saving.                                                                                                              |
| 14 scenarios that read manifests                                        | Observation-view text decodes and file reads    | unchanged                                      | higher in 4                          | Where other changes added read phases, reads that ran outside a view are now counted through one; executed `axm.io.read-file` falls in each.                                                                                                                                                                                                             |
| `local/instructions-status`, six typed `check` scenarios (2 statements) | All kinds unchanged                             | no rise                                        | one kind higher                      | Only the deliberate read phase (`axm.observation.phase` 0 → 1) and the newly counted native render (`typed/hooks/check` 0 → 6) appear; every other difference is a reduction.                                                                                                                                                                            |
| `registry/50/sync-restore/cold/baseline`                                | Summary spans                                   | 1,346                                          | 1,245 → 1,446                        | Each fresh post-write phase also carries a counted desired-state span (+100) that the prediction left out; the limit of 2,048 holds.                                                                                                                                                                                                                     |
| Authored creation scenarios                                             | Read phases                                     | +1                                             | +1 in 10 of 13, +3 in 3              | The extra two phases in rule, Knowledge and Subagent creation come from the native preflight of another recorded change; settings and lockfile parses and the open, stat and read calls fall in all three.                                                                                                                                               |

The two lint `AGENTS.md` statements were first left unexplained by a recheck
that did not read the kernel recordings. A second recheck read them line by
line and mapped every read: the in-scope reads fall from 14 to 6 in
`local/lint-fix`, which is the whole measured reduction of 8, and the four
pairs of managed-region reads stay at 8 in both binaries. The recordings do not
name the caller of those pairs; that they are the Rule and Knowledge region dry
runs is inferred from their concurrency and the code. That repeated work is not
recorded in the allocation (see [Limits](#limits)).

The 18 statements with no direct count concern quantities that no trace kind
or kernel counter sees and no test counts: in-memory copies of parsed native
configuration and of removal views (2), pure structural predicate
evaluations in MCP insertion (2), a fork's manifest write through a symlinked
or read-only manifest, unchanged (2), SHA-256 calls that no longer exist in
pack membership (2), an unchanged publish digest count (1), credential-file
reads in a case no test builds and credential decodes no test counts (2),
package-root resolution per frame collection, unchanged (1), the publication
encode of a terminal diagnostic record, unchanged (1), and the authored
preflight for Knowledge, Hook, Subagent, MCP and Pack creation, whose count
test asserts rule and skill creation, a rule fork and an MCP import on the
same code path (5). The
rechecks found no regression by inspection of the code; these remain
statements without an independent measurement.

## Paired elapsed time and peak RSS

Compare mode ran each scenario's full preflight and then one warmup and five
measured blocks, ten where the escalation rules applied. A block is one old
untraced, one new untraced, one new summary-traced and one new detail-traced
invocation in rotated order. Memory was informational and timing noise was
recorded for review, as this is a shared host. The campaign ran in eight
chunks of 33 scenarios (29 in the last) so that a harness stop would cost one
chunk, not the campaign.

| Chunk | Scenarios | Outcome                                                                                                                                                                                                                                                                                           |
| ----: | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 |        33 | Complete; assessment passed                                                                                                                                                                                                                                                                       |
|     2 |        33 | Complete; assessment passed                                                                                                                                                                                                                                                                       |
|     3 |        33 | Complete; assessment passed                                                                                                                                                                                                                                                                       |
|     4 |        33 | Complete; assessment passed                                                                                                                                                                                                                                                                       |
|     5 |        32 | Two attempts with 33 scenarios stopped in preflight on `installed/adopt-enabled-native-refusal` (97 checks, 96 verified) and collected no timing. Run without that scenario: complete; assessment **failed**: summary-tracing elapsed budget exceeded for `registry/1/sync-restore/warm/baseline` |
|     6 |        33 | Complete; assessment **failed**: summary-tracing elapsed budget exceeded for `path/cold-sync`                                                                                                                                                                                                     |
|     7 |        33 | Complete; assessment passed                                                                                                                                                                                                                                                                       |
|     8 |        29 | Complete; assessment passed                                                                                                                                                                                                                                                                       |

All 777 preflight checks of the chunks used are verified, and all 259
scenarios that could be timed have complete paired timing: 9,116 timing
samples. `installed/adopt-enabled-native-refusal` has no timing. A retry of
chunk 6 also collected all 33 scenarios and passed; it is retained as an
unused attempt, and chunk 6's failed verdict stands, as do chunk 5's two
stopped attempts.

### Untraced old versus untraced new

| Measure                                           | Value                              |
| ------------------------------------------------- | ---------------------------------- |
| Scenarios whose new median is lower / higher      | 214 / 45                           |
| Sum of the 259 median elapsed times               | 129.2 s → 114.0 s (−11.8%)         |
| Median of the per-scenario median changes         | −5.6%                              |
| Scenarios whose old median is at least one second | 9; new lower in 8; 39.8 s → 33.6 s |
| New faster in every measured block                | 92 scenarios                       |
| New slower in every measured block                | none                               |
| Flagged by the harness for variability review     | 141 (141 noisy, 20 drifting)       |

This host's noise can be read from the 19 scenarios that execute identical
product-path work in both binaries (group help nodes, `help`, `schema`): their
median difference ranges from −10.1 ms to +12.9 ms, and over their 185 paired
blocks the median difference is −3.8 ms with 42% of blocks positive. A
difference inside that band is not evidence of a change. Outside it, 150
scenarios are faster and six are slower. The one scenario of at least a second
whose new median is higher, `auth/login`, differs by +10.3 ms, inside the
band.

| Scenario                                 | Old median ms | New median ms | Change | Blocks in that direction |
| ---------------------------------------- | ------------: | ------------: | -----: | ------------------------ |
| `registry/50/sync-restore/cold/baseline` |        26,119 |        21,387 | −18.1% | faster in 5 of 5         |
| `registry/10/sync-restore/cold/baseline` |         4,295 |         3,719 | −13.4% | faster in 9 of 10        |
| `installed/skills-uninstall`             |         1,055 |           748 | −29.1% | faster in 10 of 10       |
| `typed/subagents/uninstall`              |         1,060 |           829 | −21.8% | faster in 5 of 5         |
| `typed/migrate`                          |           908 |           678 | −25.4% | faster in 10 of 10       |
| `typed/rules/uninstall`                  |           883 |           663 | −24.9% | faster in 5 of 5         |
| `installed/uninstall`                    |           929 |           724 | −22.1% | faster in 10 of 10       |
| `typed/hooks/configure`                  |           628 |           448 | −28.6% | faster in 5 of 5         |
| `typed/hooks/uninstall`                  |           947 |           771 | −18.6% | faster in 10 of 10       |
| `auth/login`                             |         1,202 |         1,212 |  +0.9% | slower in 3 of 5         |
| `preview/packs-unpack`                   |           196 |           214 |  +9.3% | slower in 4 of 5         |
| `preview/adopt`                          |           187 |           203 |  +8.5% | slower in 7 of 10        |
| `preview/disable`                        |           196 |           210 |  +7.0% | slower in 3 of 5         |
| `typed/hooks/test`                       |           259 |           277 |  +6.9% | slower in 3 of 5         |
| `maintenance/changed`                    |           343 |           364 |  +6.2% | slower in 4 of 5         |
| `installed/show`                         |           304 |           323 |  +6.2% | slower in 7 of 10        |

In each of the seven slower rows the new binary's recorded file calls,
product-path calls and every trace work kind are equal to or lower than the
old one's.

### Budget verdicts and confirmation runs

The elapsed budgets compare the new binary with tracing against the old
binary untraced: at most 20% and 50 ms more for summary tracing. Two
scenarios exceeded that summary budget in the campaign:
`registry/1/sync-restore/warm/baseline` (1,181.1 ms against 1,173.5 ms
allowed; old untraced 936.2 ms) and `path/cold-sync` (1,247.6 ms against
1,218.0 ms; old untraced 973.3 ms). The harness marks both as near the bound.
In both the untraced new binary was faster than the old one (864.6 ms and
933.5 ms). Those two verdicts stand as failed. In the unused retry of chunk 6,
`path/cold-sync` met the budget (1,253.8 ms against 1,315.0 ms; old untraced
1,054.1 ms). The budgets were declared for an isolated reference host and have
not been qualified on this one.

Two further runs of those two scenarios were made later, when the host was
idle. They are separate observations and replace nothing.

| Run       | Scenario                                | Baseline ms | Untraced candidate ms | Summary candidate ms | Summary allowed ms | Summary budget |
| --------- | --------------------------------------- | ----------: | --------------------: | -------------------: | -----------------: | -------------- |
| Old → new | `registry/1/sync-restore/warm/baseline` |       958.7 |                 854.3 |              1,101.5 |            1,200.4 | met            |
|           | `path/cold-sync`                        |       991.4 |                 877.7 |              1,206.9 |            1,239.7 | met            |
| Old → old | `registry/1/sync-restore/warm/baseline` |       945.7 |                 974.4 |              1,192.3 |            1,184.9 | **exceeded**   |
|           | `path/cold-sync`                        |       981.9 |               1,055.2 |              1,322.8 |            1,228.3 | **exceeded**   |

On the idle host the new binary passes all six of its verdicts (untraced,
summary and detail for both scenarios), and the old binary, as its own
candidate, exceeds both summary budgets; its summary-traced medians are higher
than the new binary's in the same pair of runs (1,192.3 against 1,101.5 ms;
1,322.8 against 1,206.9 ms). The campaign's two failures are therefore not
attributed to this change; they are also not explained beyond that, and the
summary budget for these scenarios is at its limit on this host with either
binary.

### Peak RSS

Peak RSS is the paired median of the untraced invocations per scenario.
Memory budgets were informational: the bounds on additional peak RSS (16, 32
and 64 MiB for untraced, summary and detail tracing) are exceeded in 63, 72
and 22 of the 259 scenarios and are recorded, not assessed.

| Measure                                                   | Value                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Median over scenarios of the median peak RSS              | 167.8 MiB → 170.8 MiB                                                         |
| Scenarios whose new median is higher / lower              | 130 / 129                                                                     |
| Median of the per-scenario differences                    | +0.05 MiB (+0.0% relative)                                                    |
| Scenarios whose median rises by more than 16 MiB / 10 MiB | 1 / 5                                                                         |
| Scenarios with a single paired increment above 16 MiB     | 63 (informational; includes warmup)                                           |
| Largest single paired increment                           | 73.0 MiB (the 50-extension restore; 151.5 MiB in the unused retry of chunk 6) |

Besides the 50-extension restore, four scenarios rise by more than 10 MiB:
`registry/10/sync-restore/cold/baseline` 323.6 → 336.2 MiB (+12.6),
`startup/missing-cancelled` 152.7 → 163.7 (+11.0),
`registry/10/list/warm/baseline` 172.2 → 182.5 (+10.3) and
`typed/subagents/update` 247.5 → 257.5 (+10.1). The largest decreases are
`local/lint` −29.5 MiB, `typed/rules/update` −29.3, `typed/migrate` −27.2 and
`typed/rules/disable` −25.8.

**One material increase.** `registry/50/sync-restore/cold/baseline` peaks at
518.5 MiB against 476.0 MiB with the old binary: +42.5 MiB (+8.9%), over five
measured blocks whose paired increments range from −99.2 to +73.0 MiB, while
running 18.1% faster. The same restore changes by −21.4 MiB with one
extension and +12.6 MiB with ten, so the increase grows with the number of
extensions.

A separate heap-sampler run of that scenario, untraced, 12 invocations per
binary, sampled the runtime's heap statistics about every 400 ms. Sampling
slows the process (the old binary's median duration is 31.6 s sampled against
26.1 s in the timing chunk), so its durations are not timing evidence. Medians of the per-invocation maxima, old → new:

| Measure                   |                     Old |                     New |
| ------------------------- | ----------------------: | ----------------------: |
| Live heap                 |               133.8 MiB |               152.4 MiB |
| Heap plus external memory |               184.7 MiB |               205.8 MiB |
| Objects                   |            1.61 million |            1.94 million |
| Sampled RSS (range)       | 490.2 MiB (461.2–542.6) | 499.3 MiB (478.8–616.4) |

At the largest sample the new binary holds more closures (lexical
environments +129 thousand, functions +90 thousand), plain objects (+105
thousand), arrays (+38 thousand) and maps (+12 thousand). Reading: about 21
MiB of additional heap and external memory at the peak (18.6 MiB of it live
heap) is retained by the observations and lazily computed values the change
shares within an invocation. That accounts for
roughly half of the 42.5 MiB median RSS difference; the remainder is not
attributed. The sampled RSS ranges of the two binaries overlap.

## Owner-level count evidence

Each removed repeat has a deterministic count test written against its owner:
exact counts of reads, parses, hashes, renders or path resolutions per path or
work kind, with setup noise reset and no wall-clock threshold, beside the
behavior controls that already existed (foreign edit before publication and
between write and record, same bytes with a new identity, symlink retarget,
absent versus empty, corruption, partial failure, interruption and rollback).

The allocation holds 807 catalog entries for 74 owners, reached from 159
routes (23 of them by equivalence to another route) in 211 modes: 312 removed
repeats, each naming its count test; 42 cases where the input was already
shared; 437 repeats that stay, each naming the requirement or the open
question behind it, 203 of them with an open question; and 16 examined
candidates that are not repeated work. Its test reconciles the allocation with
the registered command tree and checks that every cited test, source and
requirement exists. The 122 predeclared deltas that the campaign cannot
measure rest on these count tests.

## Limits

- **Platform.** Linux x64 only. No macOS or Windows run.
- **Host.** Shared and non-isolated. Counts are unaffected; elapsed and RSS
  observations are paired but noisy and are not a qualified performance
  result.
- **Counts versus cost.** Fewer calls and parses are not a latency claim.
- **One failed check and one unmeasured scenario.**
  `installed/adopt-enabled-native-refusal` fails its untraced check on a
  diagnostic source line, its two traced checks were not run, and it has no
  trace work for the new binary and no timing. The harness does not project
  source positions in diagnostic records.
- **Old trace work for the analyses.** The predeclared-delta check and the
  counter explanations read the old binary's trace work from an earlier run of
  an older main build under an earlier harness; it matches the retained run by
  work kind except for at most 10 occurrences in two scenarios.
- **Uncounted old-side work.** Old unphased desired-state evaluations, old
  archive hashes at uncounted sites, old Knowledge source hashes and old native
  Hook renders are inferred from parses, kernel reads and the code.
- **Memory and copies.** No work kind counts in-memory copies or retained
  bytes. The resource observations are paired peak RSS and one heap-sampler
  run; about half of the one material increase is attributed to shared
  in-invocation state, and the rest has no established cause.
- **An added failed open.** `typed/mcps/show` makes one failed open that the
  old binary did not make and that nothing at that owner offsets.
- **Deltas without a direct count.** 18 predeclared deltas are asserted by
  neither benchmark data nor an owner-level count test.
- **Repeated work that stays.** The allocation records 437 repeats that stay,
  203 with an open question. This ledger measures the change; it does not
  adjudicate those questions.
- **Completeness.** The allocation records the repeated work that was
  identified; it is not a proof that no unrecorded repeated work remains. This
  campaign's own recordings show one case the allocation does not record and
  the change does not remove: in a lint run the instruction target is read
  eight times by the Rule and Knowledge managed-region dry runs behind the
  invariant-facts evaluation (twice per region per evaluation, two evaluations
  per run), with nothing written in between; the old binary does the same.
- **Nondeterminism excluded by rule.** Lock heartbeats and automatic
  archive-cache prune scans vary between runs and are reported apart, as the
  tracing guide specifies.
- **Trace retrieval.** The harness retrieves each trace once; a late receiver
  stops a campaign. No run of this campaign stopped that way.

## Retained files

| File                                                                 | Content                                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [provenance.json](provenance.json)                                   | Revisions, binary hashes, harness and lock hashes, host, tools, and each run's start, end and outcome                                                                |
| [fixtures-old-new.report.json.gz](fixtures-old-new.report.json.gz)   | The old-versus-new fixture report                                                                                                                                    |
| [fixtures-old-old.report.json.gz](fixtures-old-old.report.json.gz)   | The old-versus-old fixture report                                                                                                                                    |
| [physical-work-comparison.json.gz](physical-work-comparison.json.gz) | Every differing per-path kernel counter, per scenario                                                                                                                |
| [work-summary.json](work-summary.json)                               | Per scenario: file calls, product-path calls and trace work by kind, old and new; totals                                                                             |
| [compare-summary.json](compare-summary.json)                         | Per scenario: paired medians, per-block deltas, peak-RSS medians and increment, variability flags; per chunk: outcome and issues; unused attempts; confirmation runs |
| [timing/](timing)                                                    | Each timing chunk's report (chunk 5 as used, without the failing scenario), the three unused attempts and the two confirmation runs                                  |
| [predeclared-deltas.json](predeclared-deltas.json)                   | All 581 statements with measured values, verdicts and the independent rechecks                                                                                       |
| [counter-rises.json](counter-rises.json)                             | The explanation and the independent verdict for each counter that rose                                                                                               |
| [heap-summary.txt](heap-summary.txt)                                 | The heap sampler's per-binary summary and object counts by type                                                                                                      |

Each retained report is the runner's report with one substitution, the name of
the local evidence directory in the two binary paths; `provenance.json` records
the SHA-256 of each original. The raw sample directories (recordings, traces,
inspections, snapshots; about 1.1 GB before compression for the old-versus-new
run and 0.5 GB for the old-versus-old run) and the heap sampler's report are
not retained in the repository.
