# Batch review: rebinding the AXM corpus to the shared contract

Set review for the batch that rebound every AXM specification to the shared
contract in `@agentxm/extension-model/unstable/specifications`. This record is
evidence for the maintainer's acceptance decision; it is not authority.

## Boundary

- Scope: every specification under `cli/`, `extension-identity/`,
  `package-identity/`, `settings-contract/`, `source-resolution/`,
  `version-constraints/`, and `system/` (80 files), the local product-goal
  registry, and the metadata contract itself.
- Baseline revision: `358b7b16d` (the commit before this batch).
- Source set: the 80 specification files and their scenarios, the former
  `specifications/support/contract.ts`, `specifications/product-goals.ts`, the
  testing strategy, and the executable-specifications and
  specification-infrastructure decision records.
- Exclusions: implementation packages, the 17 end-to-end execution bindings
  (unchanged; re-validated through the shared decoder), and the AgentXM
  platform corpus, which is re-derived under its own authority.

## What this batch changed

- Every specification imports `defineSpecification` from the shared contract;
  the local contract module is removed.
- Class remap, applied mechanically and without changing any obligation:

  | Former class     | Now                                         | Files |
  | ---------------- | ------------------------------------------- | ----- |
  | `functional`     | `functional`                                | 58    |
  | `process`        | `process`                                   | 8     |
  | `architecture`   | `constraint`                                | 5     |
  | `security`       | `quality`, characteristic `security`        | 2     |
  | `compatibility`  | `quality`, characteristic `compatibility`   | 1     |
  | `installability` | `quality`, characteristic `installability`  | 1     |
  | `usability`      | `human-factors`, characteristic `usability` | 0     |

- Every specification gained a product-language `statement`, `status`,
  `derivedFrom: []`, `supersedes: []`, `assumptions`, and `openQuestions`;
  the 15 repository-boundary specifications gained a `boundaryRationale`.
- The six goals more than one AgentXM repository serves moved to the shared
  registry (`extension-adoption`, `trustworthy-distribution`,
  `machine-automation`, `knowledge-access`, `privacy-and-consent`,
  `dependable-change-process`); the local registry keeps the six AXM-only
  goals.

## Acceptance basis and open review

- `status: "accepted"` was carried forward from each specification's prior
  maintainer acceptance because no obligation, scenario, or assertion changed;
  the rebinding is metadata.
- The `statement`, `boundaryRationale`, `assumptions`, and `openQuestions`
  values were authored in this batch from each specification's title and
  scenarios. They restate existing obligations rather than adding new ones, but
  they are new normative text and need maintainer read-through. A statement the
  maintainer rejects is corrected as a specification revision.
- The reassessment notes below propose splits, merges, reclassifications, and
  retirements for a following batch. None was applied here; every listed
  specification keeps its identity, class, and scenarios.

## Set review findings

- Orphans: none found. Every specification references at least one registered
  goal and every active goal has at least one referencing specification.
- Duplicates and overlaps: see the `merge` rows below.
- Contradictions: none found.
- Gaps: none newly identified; completeness against the command tree is
  enforced by `system/architecture/specification-folders-mirror-command-tree`.
- Unverifiable claims: none. No specification declares only `manual` or
  `review` methods.
- Stale witnesses: none identified in this batch.
- Verdict limitation: the per-change verdict for this batch reports every
  specification as added rather than revised, because the base revision's
  metadata predates the shared contract and no longer decodes. From this batch
  onward both sides of a verdict share one contract and revisions render as
  revisions.

## Reassessment notes for the next batch

| Specification                                                           | Kind                  | Note                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/install/direct-intent-recorded-and-realized`                       | split                 | Bundles five outcomes (desired configuration, lockfile resolution, canonical content, agent projections, applied result); result reporting already has its own identity.                           |
| `cli/install/inline-mcp-configuration-not-acquirable`                   | ambiguous-subject     | The required outcome is pinned only by rendered text containing the entry name and "sync"; the product vocabulary for the reported state is unsettled.                                             |
| `cli/install/preview-is-pure`                                           | split                 | Preview purity and preview-versus-apply equivalence are distinct obligations serving different goals.                                                                                              |
| `cli/install/reinstall-is-idempotent`                                   | merge                 | Repeats one scenario across root and type command forms, duplicating the parity concern owned by `root-and-type-forms-express-same-intent`.                                                        |
| `cli/lint/catalog-is-complete`                                          | implementation-detail | Asserts on catalog metadata (rule group, array order) rather than a product surface; confirm those are public contract facts.                                                                      |
| `cli/lint/findings-name-the-violated-invariant`                         | split                 | Also prohibits suggestion output in machine lint, a separate machine-automation obligation.                                                                                                        |
| `cli/lint/honors-configured-rule-severities`                            | split                 | Severity mapping and the normal-versus-strict exit policy are two obligations.                                                                                                                     |
| `cli/lint/observes-selected-filesystem-view`                            | reclassify            | Shells out to a real git binary, so evidence is not in-memory; decide whether to declare a process boundary with a rationale.                                                                      |
| `cli/lint/official-skill-findings-follow-declared-intent`               | split                 | Combines the informational "declared" rule with the "compatible" error rule and pins a machine recovery contract inside an experience specification.                                               |
| `cli/command-help-is-complete-and-alias-free`                           | split                 | Help completeness and the absence of alias routes are two obligations; the alias prohibition is phrased as pre-launch.                                                                             |
| `cli/every-type-completes-the-shared-lifecycle`                         | implementation-detail | Third scenario asserts test-inventory coverage of the type catalog; MCP and pack lifecycle evidence lives in an end-to-end package.                                                                |
| `cli/force-bypasses-only-named-policies`                                | ambiguous-subject     | Identity claims a behavioral obligation but evidence only inspects help text; narrow the identity or add behavioral scenarios.                                                                     |
| `cli/lockfile-version-errors-expose-structured-problem`                 | merge                 | Nearly every assertion is repeated by `workspace-lockfile-rejections-name-state-and-recovery`; the envelope evidence could move to `machine-errors-use-the-stable-envelope`.                       |
| `cli/machine-mode-never-prompts`                                        | ambiguous-subject     | Cross-command invariant evidenced only through the setup command; widen scenarios or narrow the identity.                                                                                          |
| `cli/projection-currency-follows-state-authority`                       | split                 | Three separable obligations: currency by authoritative inputs, decoded-value comparison of native projections, invalid ownership markers blocking reconciliation.                                  |
| `cli/settings-validity-gates-operations`                                | merge                 | Shares the read/diagnose/preview/mutate gate matrix with `workspace-lockfile-rejections-name-state-and-recovery`; one gate obligation with settings and lockfile faults as rows may be preferable. |
| `cli/workspace-lockfile-rejections-name-state-and-recovery`             | split                 | The rejection gate is one obligation; the two recovery scenarios describe a separate recovery-route obligation.                                                                                    |
| `cli/agents/membership-changes-realize-affected-outputs`                | split                 | Carries add and remove plus an idempotent add and a preserves-unowned-content family member.                                                                                                       |
| `cli/instructions/management-is-explicit`                               | split                 | Status reporting, enable, disable, and idempotent disable are four obligations across three command nodes.                                                                                         |
| `cli/mcps/inline-authority-is-operation-coherent`                       | split                 | Mixes an authority obligation, a projection obligation, and an entry-shape validation rule; the identity names none of them in product language.                                                   |
| `cli/mcps/inline-lifecycle-is-idempotent`                               | split                 | Named for idempotency but also states add and uninstall behavior; uninstall scenarios sit outside `cli/mcps/uninstall/`.                                                                           |
| `cli/mcps/install/local-connection-names-share-source-resolution`       | split                 | One positive obligation bundled with four rejection rules that read as interface obligations.                                                                                                      |
| `cli/mcps/list/local-name-source-and-resolution-are-distinct`           | split                 | Declared interface role, but one scenario asserts the human table layout.                                                                                                                          |
| `cli/mcps/secret-namespaces-include-local-and-source-identity`          | implementation-detail | Calls the account-derivation function directly; the declared property method is a fixed example set. Consider a library concept area or bound evidence.                                            |
| `cli/packs/authored-packs-expand-membership`                            | split                 | `packs new` and `packs add` are separate command obligations; the third scenario restates `cli/uninstall/removes-direct-route-and-recomputes-reachability`.                                        |
| `cli/publish/preview-is-pure-and-gate-is-fixed`                         | split                 | The identity joins two obligations; `preview-is-pure` is the reserved family name.                                                                                                                 |
| `cli/publish/requires-explicit-acceptance-for-non-head-source`          | split                 | Also specifies the source-state report shape and preflight behavior; two scenarios count comparison invocations, an implementation observation.                                                    |
| `cli/skills/install/bundled-recovery-converges`                         | ambiguous-subject     | Title promises unchanged source authority, but recovery rewrites the settings entry and retires the lock row; also carries an unrelated authored-skill block.                                      |
| `cli/sync/preserves-configuration-and-resolutions`                      | split                 | Third scenario (first resolution recorded) is realization behavior overlapping `cli/sync/realizes-desired-state`.                                                                                  |
| `cli/sync/realizes-desired-state`                                       | ambiguous-subject     | "Bidirectionally" has no product-language referent; the removal scenario overlaps `cli/sync/preserves-unowned-agent-content`.                                                                      |
| `cli/update/advances-resolution-within-intent`                          | split                 | The blocked-for-undesired-extension scenario is a distinct precondition; "within intent" is not evidenced (recorded as an assumption).                                                             |
| `cli/update/bundled-source-routes-to-recovery`                          | split                 | Experience obligation asserted alongside a detailed machine-output shape that would be an interface requirement.                                                                                   |
| `extension-identity/canonical-names-round-trip`                         | split                 | Bundles the round trip with reference parsing and owner input normalization.                                                                                                                       |
| `extension-identity/malformed-names-are-rejected`                       | split                 | Final scenario rejects a malformed version constraint, a reference and version-constraint obligation.                                                                                              |
| `package-identity/companion-packages-are-identities-not-pins`           | split                 | Supported-ecosystem enforcement is spread across this file and `compatibility-ranges-match-the-package-ecosystem`.                                                                                 |
| `package-identity/compatibility-ranges-match-the-package-ecosystem`     | split                 | Range grammar validity and companion declaration agreement are two obligations.                                                                                                                    |
| `settings-contract/published-schemas-agree-with-accepted-input`         | split                 | Settings schema and lockfile schema are separate artifacts; several scenarios assert JSON Schema structure rather than product behavior.                                                           |
| `settings-contract/saving-settings-preserves-authored-formatting`       | split                 | Third scenario checks encode fidelity without a file save, outside the stated subject.                                                                                                             |
| `system/architecture/e2e-observes-only-shipped-artifacts`               | reclassify            | Restricts how verification is built, so it reads as `process`; relative imports across project roots depend on the module-boundary lint, which should be bound as evidence.                        |
| `system/architecture/live-composition-stays-in-application`             | implementation-detail | Names internal source structure and asserts the exact lint ignore list; keep the composition rule, move the exception list to an internal test.                                                    |
| `system/architecture/package-dependencies-point-inward`                 | split                 | Bundles inward direction, no cycles, and no feature-to-feature dependency; the level allow-lists are read from lint configuration.                                                                 |
| `system/architecture/public-system-depends-only-on-published-contracts` | ambiguous-subject     | The registry-client scenario accepts either a generated or any source directory and cannot fail; make it decisive.                                                                                 |
| `system/architecture/specification-folders-mirror-command-tree`         | reclassify            | An authoring rule for the corpus itself, so `process` fits better than `constraint`; bundles three checks.                                                                                         |
| `system/compatibility/supported-platform-matrix`                        | implementation-detail | Reads workflow text while the actual compatibility evidence comes from CI matrix jobs; bind those jobs as boundary executions and keep the read as a coverage check.                               |
| `system/installability/product-installs-through-supported-channels`     | split                 | Installers exist and verify integrity versus release-time install verification on every shell, which overlaps the platform-matrix specification.                                                   |
| `system/process/dual-typescript-alias-retained`                         | implementation-detail | A toolchain alias with a sunset is a decision record, not an obligation owed to anyone; retire to a tooling test or reclassify as a constraint with an explicit retirement condition.              |
| `system/process/pre-launch-changes-stay-coherent`                       | retire                | Time-boxed to pre-launch and evidenced only by policy text in the instructions; plan retirement or supersession at public launch.                                                                  |
| `system/process/public-artifacts-protect-private-context`               | ambiguous-subject     | The scan exempts installed extension content without a recorded reason; confirm and record the scope.                                                                                              |
| `system/process/release-preparation-isolates-candidate-state`           | implementation-detail | Scenarios assert source-text ordering of private functions; bind the tooling tests as evidence or drive the orchestration against a fake host, and correct the declared methods.                   |
| `system/process/release-preparation-validates-production-gates`         | implementation-detail | Scenarios assert private call ordering and literal arguments rather than observable preflight behavior.                                                                                            |
| `system/security/telemetry-consent-and-precedence`                      | reclassify            | The consent decision table is functional behavior for the privacy goal; if it stays quality, the characteristic is `privacy`. One scenario reads the committed settings schema without a boundary. |
| `system/security/telemetry-failure-never-alters-outcomes`               | reclassify            | Failure isolation is reliability or plain functional behavior, not security; its placement under `system/security` is misleading.                                                                  |
| `system/security/telemetry-payloads-respect-data-boundary`              | reclassify            | Data minimization for the privacy goal; characteristic `privacy`. The allowed field list lives in the specification rather than a published telemetry contract.                                    |

## Acceptance

- Rebinding: landed on `main` under the maintainer's direct-to-main
  authorization for this migration step.
- Statements and lineage fields: awaiting maintainer read-through.
- Reassessment notes: proposals for a following batch; none accepted.
