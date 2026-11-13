# CLI output and latency evidence

This package records GitHub Actions [run 43448613471, attempt 1](https://github.com/agentxm/axm/actions/runs/43448613471): baseline `5e3feab1de3f0565611de25971a671c8e66807f2` and candidate `b95202797d571cf9103c943b13cd4936388f9e86`. Both measured checkouts were clean. These measurements belong to those snapshots, not a later integration commit or skill revision.

The separate ordinary-inventory specification passed its existing **p95 < 500 ms** bound: **420.25 ms JSON**, **468.59 ms human**, with three warmups and twenty samples per mode. [All samples and execution evidence](inventory-latency.json) are retained.

The paired output benchmark used one warmup and five measured repetitions, balanced baseline/candidate order, and a sequential job on a fresh four-CPU Ubuntu 24 hosted runner. All 26 scenario/mode/subject groups stayed below the preregistered investigation triggers: range/median < 20%, and absolute first-to-last difference/median < 10%. These are noise checks, not a regression allowance or evidence of a general speedup.

Representative complete JSON stdout from measured iteration 0:

| Task                                           | Baseline bytes | Baseline, whitespace only removed | Candidate bytes | Baseline tokens | Candidate tokens |
| ---------------------------------------------- | -------------: | --------------------------------: | --------------: | --------------: | ---------------: |
| Ordinary inventory, 30 items                   |         42,566 |                            22,169 |          22,206 |           9,796 |            6,052 |
| Detailed list → ownership inspection, 30 items |        342,387 |                           192,887 |          93,867 |          64,257 |           24,247 |
| Restore 50 packages, apply                     |      1,258,834 |                           772,398 |         105,049 |         246,185 |           29,650 |
| Restore 50 packages, preview                   |         36,063 |                            25,367 |          44,397 |           8,820 |           12,503 |
| Publication preview, 3 packages / 100 paths    |        273,699 |                           112,733 |          19,185 |          54,135 |            4,849 |

Whitespace-only figures reserialize the same complete baseline JSON with compact separators and a trailing newline. They are derived output-size comparisons, not executed commands or timing samples. Token counts use **tiktoken 0.12.0, `o200k_base`**, including whitespace and terminal newlines; they are not provider billing or universal model token counts. [Measurements](measurements.json) include exact stdout **and stderr** bytes, tokens, hashes, line counts, elapsed time, and peak RSS for all 130 measured and 26 warmup invocations, including whitespace-only baseline token counts.

The tradeoffs remain visible:

- Bulk `show --all` provides ownership, desired/accepted/observed state, and retention information beyond legacy `list --details`. Its median took **17.6% longer for JSON** (1,068.64 → 1,257.06 ms) and **20.4% longer for human output** (1,118.69 → 1,346.70 ms). Human stdout grew **25,672 → 77,204 bytes**. This is a comparison of different tasks, not an equivalent-query performance claim.
- Restoration preview JSON grew **23.1%** because it adds structured source/version/reason/downgrade transitions. The existing transition labels remain. The measured apply output shrank substantially without a corresponding general latency claim.
- Ordinary inventory's JSON size reduction is almost entirely whitespace. Its compact baseline is slightly smaller than the candidate envelope.
- Machine restoration-apply stderr remains **53,391 bytes / 16,517 tokens** in the representative pair. Reduced stdout does not imply reduced lifecycle-event volume.
- Single-subject inspection and schema discovery have no invented baseline. Their absolute measurements are included. Schema export is a complete-volume output class; its human outline and JSON schema are different documents.

[Independent semantic review](semantic-review.json) reparsed every machine capture and checked the actual raw records, rather than accepting benchmark assertions alone. Expanded native reader declarations reproduce the baseline's ordered audiences and per-reader state/reason facts. Subject/unit associations, addresses, aliases, ownership, configured consumers, and proof remain equal. Representative structural multiplicities are:

| Representation                                      |                             Baseline |                                                   Candidate |
| --------------------------------------------------- | -----------------------------------: | ----------------------------------------------------------: |
| Bulk inspection native records                      |                                   40 |                                     40, referenced 40 times |
| Bulk inspection repeated reader/availability rows   |                            880 / 880 |     44 reader entries in 2 shared declarations / 2 defaults |
| Restoration-apply native record occurrences         | 200, representing 100 unique records |                                   100, referenced 100 times |
| Restoration-apply repeated reader/availability rows |                        4,400 / 4,400 |     44 reader entries in 2 shared declarations / 2 defaults |
| Publication rule explanations                       |                                  915 | 15 explicit rules, plus 900 omitted inherited rules counted |

Across all six repetitions, all three publication archives retain identical included/excluded path records, sizes, integrity, warnings, source provenance, and other outcome facts. All five explicit zero-match rules per package remain; only 300 unmatched inherited explanations per package become a count. This fixture does not establish matched-inherited-rule behavior or every runtime-availability exception; those require separate specifications.

[Capture pairs](capture-pairs.tar.gz) contain complete, unmodified stdout, stderr, and receipts for iteration 0 of all 26 groups. [The capture manifest](capture-manifest.json) records every member's size and SHA-256. No stream is clipped or summarized inside the archive. Synthetic fixture paths remain verbatim so output hashes and byte counts are reproducible. Executables, full filesystem snapshots, host process/environment logs, auth material, private context, and agent transcripts are excluded.

[Provenance](provenance.json) records exact source/binary hashes, toolchain, fixture identities, protocol, and source-artifact hashes. Host snapshots support a sequential hosted-runner assessment but do not measure interval CPU utilization. The file Registry removes remote transport variation, so these results make no network-performance claim. Agent task acceptance and skill evaluation are separate evidence.

To repeat the process measurements, build each recorded clean revision through its owning `cli:compile-host` target, preserve each binary, and create its manifest with `binaryPath`, `binarySha256`, `sourceRevision`, and `sourceDirty: false`. Run from the candidate checkout on an isolated Linux host, using a fresh evidence directory:

```sh
export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false
AXM_BENCHMARK_SUITE=output-contracts \
  AXM_OUTPUT_BASELINE_MANIFEST=/absolute/path/baseline.json \
  AXM_OUTPUT_CANDIDATE_MANIFEST=/absolute/path/candidate.json \
  AXM_OUTPUT_BENCHMARK_OUTPUT=/absolute/path/new-evidence \
  AXM_OUTPUT_BENCHMARK_RUN=measure \
  AXM_OUTPUT_REFERENCE_HOST=1 \
  pnpm bench
pnpm exec nx run cli-e2e:test:performance
```

The owning targets establish build prerequisites; run the two measurements sequentially without other builds, tests, or agent trials. [The benchmark](../../output-contracts.ts) owns the fixture and paired protocol; [the inventory specification](../../../apps/cli-e2e/src/ordinary-inventory-latency.spec.ts) owns the latency bound. Omitting `AXM_OUTPUT_BENCHMARK_RUN=measure` collects captures without a performance claim. Exact token recounting uses `len(tiktoken.get_encoding("o200k_base").encode(stream.decode("utf-8")))` on each complete archived stream with the pinned tokenizer version.

## Agent task and activation evidence

[The agent evaluation](agent-evaluation.json) records a separate experiment: 20 task cases, three arms, and two repetitions, followed by four activation cases with two skill arms and two repetitions. The evaluator was **Codex 0.167.2, gpt-6-astra, medium reasoning**, with two independent trials running concurrently. Each paired world passed preparation, isolation, actual local-mutation, and applicable Git checks before model execution. The report identifies the exact frozen CLI binaries, skill, preregistration, source snapshots, receipts, and reviews. Its working-tree candidate is distinct from the clean hosted-runner snapshots measured above.

| Task arm                      | Task passes | Fully grounded passes | CLI calls | Help / schema calls | Raw CLI stdout + stderr bytes | Raw CLI stdout + stderr tokens |
| ----------------------------- | ----------: | --------------------: | --------: | ------------------: | ----------------------------: | -----------------------------: |
| Baseline CLI + current skill  |       40/40 |                 40/40 |       309 |             176 / 0 |                     1,996,788 |                        430,580 |
| Candidate CLI, no skill       |       38/40 |                 37/40 |       189 |             115 / 2 |                       608,243 |                        130,570 |
| Candidate CLI + minimal skill |       40/40 |                 40/40 |       214 |            112 / 10 |                       678,510 |                        148,488 |

These counts retain unsuccessful commands and recoveries. The no-skill arm did **not** achieve an all-task 100% result. One trial repeated a supplied synthetic secret in its final report; another correctly implemented software but manually reconstructed native MCP configuration when AXM was unavailable. Both failures remain counted. The preregistered interpretation permits those irreducible reporting and ownership boundaries to justify exact retained minimal instructions only with corresponding minimal-arm success; both corresponding minimal repetitions passed. A separate no-skill Hook answer had correct facts but claimed exact binding evidence it had not observed, so it is excluded from fully grounded passes.

The separate activation sample passed **8/8 in each skill arm**: eight correct activations across the two management prompts and eight correct nonactivations across ordinary Skill use and MCP software implementation. Review checked actual skill reads, task effects, and final claims; the four resulting software functions were also independently executed. Four prompts and two repetitions do not establish a general activation rate.

Available instruction size and observed loading are separate measurements. The baseline package contained **1,821 words**: a 1,031-word entry and 790 words across four references. All 40 baseline task trials read the entry; 19 read references. Confirmed complete AXM-file exposures totaled **68,076 tokens**. The minimal package contained **231 words total, 165 in its body**, with no references; all 40 task trials read it, totaling **15,080 tokens**. Every reviewed file read has a complete matching payload in retained tool output. The report nevertheless distinguishes these observed complete-file totals from unavailable exact accounting for arbitrary partial or mixed context. [The skill disposition record](skill-disposition.json) connects each retained, relocated, or removed instruction to its evidence.

The frozen candidate executable still contained the old bundled skill. An explicit audit of all **88 candidate task and activation trials** found no bundled-skill installation or applying setup call, no alternate acquired AXM skill, no old-body exposure, and no change to the expected absent or exact minimal injected body. The bundled copy did not contaminate the evaluated candidate arms.

Twenty-four original task observations were excluded for fixture defects and replaced by freshly prepared paired trials: a user-scope Pack path, an accepted-dependency oracle, and publication setup/protocol issues. The valid task sample comprises 96 original observations plus 24 replacements. The uncertainty fixture uses a captured SIGINT delivered only to the identified publication child after independently observed committed dispatch; raw exit 130, streams, and server evidence are retained. A preceding apparatus-invalid campaign is excluded entirely. Excluded observations were never relabeled as passes.

Independent review of every command and file-edit record resolves the observable reconstruction fields for all 136 valid trials. Raw lock content reads, opaque integrity checks, custom JSON parsing, and direct managed-state changes are separate measurements. No agent-written lock graph reconstruction or lock rewrite was observed. The one manual native-configuration reconstruction is the already counted no-skill failure. These findings describe recorded actions, not hidden model reasoning; reading or parsing alone does not prove unnecessary work.

Semantic manual joining remains a separate cost: five baseline trials explicitly assembled accepted-state or authority facts across raw lock/settings and other evidence. Two no-skill Hook trials answered from raw state without CLI inspection, including the separately retained unsupported-binding claim. Other trials read raw files alongside CLI answers; where that overlap does not establish semantic dependence, the report retains `null` rather than asserting absence. Original qualitative review findings remain available per trial.

| Task arm                      | Trials reading raw lock content | Trials using custom JSON parsing | Explicit corrective CLI calls | Additional ambiguous fallback calls |
| ----------------------------- | ------------------------------: | -------------------------------: | ----------------------------: | ----------------------------------: |
| Baseline CLI + current skill  |                              21 |                                2 |                            15 |                                0–10 |
| Candidate CLI, no skill       |                              24 |                                3 |                             5 |                                   0 |
| Candidate CLI + minimal skill |                               9 |                                1 |                             7 |                                   0 |

The 27 explicit task corrections occurred in 26 shell calls; 22 corrected task requests and five corrected discovery requests. Twelve additional discovery calls intervened in those recovery chains. The activation sample contains five explicit corrections in four shell calls and one ambiguous fallback. Bounds cover only independently reviewed candidate events; they are not exact counterfactual causal totals. Original reviews and verdicts remain unchanged, with hashed supplements recording these classifications.

The JSON report also includes per-trial and per-arm provider usage, shell and CLI calls, help/schema calls, nonzero exits, and elapsed durations. Provider billing cost was not captured. The raw truncation detector's matches were literal `truncated: false` fields or help wording, not clipping warnings; actual model-context truncation is unavailable. CLI stream tokens use the pinned tokenizer above and are separate from provider token usage.

Observed task median durations were 33.46 seconds baseline, 26.95 seconds without a skill, and 28.51 seconds with the minimal skill. These were agent executions under concurrency two with other host work, **not isolated latency measurements or a speedup claim**. Reviews were performed by implementation participants using transcripts, consequential outputs, and independent state evidence; they were not external or blinded. Private transcripts, system context, authentication material, and full filesystem snapshots are withheld. The sanitized report binds their retained hashes and makes no claim of public transcript reproducibility.
