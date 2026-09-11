# AXM specification catalog

Generated from specification metadata discovered across every authored
project by `scripts/specification-catalog.ts`. Do not edit by hand: run
`pnpm run generate` after a specification change. This catalog lists every
requirement specification whether or not its implementation currently
passes; execution evidence lives in test results, never here. Every
specification in this catalog is normative: a specification on `main` is
accepted authority, and merging the change that adds, revises, or removes
one is the acceptance decision. Requirements are organized by meaning, not
by location: by their role in the product contract (product behavior,
programmatic interfaces, supporting system behavior), then by the first
product goal each names as its primary goal, then by review class. Each
entry names the project that owns its canonical source file and links it;
the requirement identity is stable and independent of that path.

Start from a command or an operating context with these structural maps:

- [Command and parameter inventory](../apps/cli/src/test-support/command-behavior-allocation.json) — command routes, flags and arguments with their applicable owners or unresolved scope.
- [Context inventory](../apps/cli/src/test-support/context-allocation.json) — extension types, sources, scopes and other declared contexts with their applicable owners or named interface authority.

These maps support navigation and structural checks. They do not establish
semantic completeness, correct applicability, or passing behavior.

## Product behavior

### Goal: actionable-diagnostics

People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.

#### Functional

##### A request naming an unsupported coding agent is refused with corrective guidance

- Requirement: `cli/agents/capabilities/rejects-unknown-agent`
- Owner: `workspace-configuration`
- Statement: When a membership or capability request names a coding-agent identifier outside the configurable catalog, AXM shall refuse it before any membership change or report is produced and shall name the nearest supported identifier, or how to list the supported identifiers when none is close.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-configuration/src/membership/validate-agent-ids.ts`, `cli/agent-selection-is-membership-or-filter`
- Open questions: cli/agent-selection-is-membership-or-filter separately refuses an unsupported id supplied through the --agent option at parse time; whether that rule should cite this one as the authority for corrective guidance, or stay a distinct parse-time rule, is undecided.
- Source: [`packages/core/workspace-configuration/src/membership/rejects-unknown-agent.spec.ts`](../packages/core/workspace-configuration/src/membership/rejects-unknown-agent.spec.ts)

##### A blocked approval names a recovery the command line will accept

- Requirement: `cli/approval-required-names-a-valid-recovery`
- Owner: `cli`
- Statement: When an apply stops as approval required, its recovery shall name the approval its route supports — a replay carrying the advance-approval flag where the route offers one, otherwise an interactive rerun without machine or non-interactive switches — the named command shall parse on the real command line, and a request whose values cannot be replayed safely shall describe the recovery without echoing those values.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The CLI composes the recovery command and the registered parser decides whether it is admissible; both are reachable in process. The built-CLI replay of the emitted command is bound evidence at apps/cli-e2e/src/approval-required-recovery.e2e.test.ts.
- Methods: example, contract
- Derived from: `cli/lockfile-rejections-name-recovery-routes`, `cli/confirmation-flags-have-a-supported-purpose`, `apps/cli-e2e/src/approval-required-recovery.e2e.test.ts`
- Limitation: These replays use inert values without shell quoting; the interactive-only recovery is parsed through its complete registered branch with an observing handler and does not establish terminal prompt behavior. Retires when: Add quoted recovery values and an interactive terminal replay through a supported process harness; existing confirmation specifications continue to own prompt behavior.
- Additional evidence: process via [`apps/cli-e2e/src/approval-required-recovery.e2e.test.ts`](../apps/cli-e2e/src/approval-required-recovery.e2e.test.ts) — Only a real command line shows that the emitted recovery parses and, when run, produces exactly the transition it promised while leaving unrelated workspace content alone.
- Source: [`apps/cli/src/root/shared/approval-required-names-a-valid-recovery.spec.ts`](../apps/cli/src/root/shared/approval-required-names-a-valid-recovery.spec.ts)

##### A delegating operation narrates the external work it hands off

- Requirement: `cli/delegated-operations-narrate-external-work`
- Owner: `cli-update`
- Statement: An operation that delegates work to an external tool shall publish one unit for each command it delegates, nested under the unit that delegated it, and shall publish a wait naming its blocking class and subject for each poll that blocks on that tool, so the delegated work is observable while it runs rather than only after it settles.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Limitation: The conditional wait narration obligation has no product polling witness after upgrade stopped polling publication. Retires when: A command that polls an external tool supplies an event-log example for waiting and completion.
- Limitation: Upgrade is the only delegating operation this specification exercises; another command that delegates to an external tool is covered by the statement but not yet by an example. Retires when: A second command delegates to an external tool and its event log is added to this specification.
- Source: [`packages/core/cli-update/src/upgrade/delegated-operations-narrate-external-work.spec.ts`](../packages/core/cli-update/src/upgrade/delegated-operations-narrate-external-work.spec.ts)

##### Quiet takes precedence over debug and verbose diagnostics

- Requirement: `cli/diagnostic-controls-select-the-requested-detail`
- Owner: `cli`
- Statement: For human error diagnostics produced after command flags have been parsed and the command runtime initialized, AXM shall select quiet before debug before verbose before ordinary detail, with --quiet or -q requesting quiet, --debug or AXM_DEBUG requesting debug, --verbose, -v, or AXM_VERBOSE requesting verbose, and only the environment values 1 and true enabling those requests.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The registered parser decides which flag spellings a command admits, and the production verbosity resolver decides which detail a parsed request selects; both are reachable in process, and the built-CLI rendering of that detail is bound evidence at apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts.
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli/src/cli-flags/index.ts`, `apps/cli/src/runtime.ts`, `apps/cli/src/cli-runtime/runtime-envelope.ts`, `apps/cli/src/app-error/render.test.ts`, `apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts`
- Open questions: The earlier public quiet description covered narration, tables, progress, and required actions as well as error detail; complete human-output suppression across commands needs separate allocation and evidence.; What diagnostic selection is promised for failures before parsed command runtime initialization, including raw arguments after -- and parser failures?
- Limitation: These examples distinguish detail levels through the resolver and one production settings-error path. They do not prescribe exact cause text, stack frames, log messages, logger severity names, or every flag and environment combination. Retires when: Add distinct producer or combination evidence when a reviewed source reveals behavior not distinguished by these examples.
- Additional evidence: process via [`apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts`](../apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts) — Only a real process shows the selected detail reaching rendered stderr: the built CLI parses the global flags itself, reads the environment it was given, and renders cause and stack through the production error screen.
- Source: [`apps/cli/src/cli-flags/diagnostic-controls-select-the-requested-detail.spec.ts`](../apps/cli/src/cli-flags/diagnostic-controls-select-the-requested-detail.spec.ts)

##### Help lists the available topics and how to read them

- Requirement: `cli/help/lists-available-topics`
- Owner: `cli-e2e`
- Statement: When invoked without a target, help shall list every bundled topic with a description and an invocation for reading a topic.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI emits its topic index; an independent inventory of published Markdown and schema sources detects missing, duplicate, and extra entries.
- Methods: contract, example
- Derived from: `apps/cli/help/README.md`, `apps/cli/src/root/help/command.test.ts`
- Source: [`apps/cli-e2e/src/help/lists-available-topics.spec.ts`](../apps/cli-e2e/src/help/lists-available-topics.spec.ts)

##### Help returns the requested topic or command guidance

- Requirement: `cli/help/returns-requested-topic-or-command`
- Owner: `cli-e2e`
- Statement: When help names a published topic or supported command path, AXM shall return that content or command help, and shall reject an unknown target with an invocation that lists available topics.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: Built CLI calls verify target parsing, published source content, equivalent nested command help, and execution of the recovery invocation.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/help/command.ts`, `apps/cli/src/root/help/command.test.ts`
- Open questions: Which target takes precedence when a single word names both a topic and a command? These examples do not establish that collision policy.
- Source: [`apps/cli-e2e/src/help/returns-requested-topic-or-command.spec.ts`](../apps/cli-e2e/src/help/returns-requested-topic-or-command.spec.ts)

##### Lint fix requires known ownership and unambiguous content

- Requirement: `cli/lint/fix-repairs-only-determined-state`
- Owner: `workspace-lint`
- Statement: When lint runs with --fix, it shall repair only state that local authority fully determines, such as a missing instruction alias, and shall fail with a conflict without touching the workspace when a target is unowned or its desired content is ambiguous.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: A repair is a write to a real working tree, so the decisive evidence is the tree itself: the alias that appears, and the authored file that is still byte-identical afterwards.
- Methods: example
- Source: [`packages/core/workspace-lint/src/run/fix-repairs-only-determined-state.spec.ts`](../packages/core/workspace-lint/src/run/fix-repairs-only-determined-state.spec.ts)

##### Local lint honors configured rule severities

- Requirement: `cli/lint/honors-configured-rule-severities`
- Owner: `workspace-lint`
- Statement: For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, and apply the catalog default when unconfigured.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Severity resolution reads the workspace's own settings document and decides the reported finding and summary; no process boundary adjudicates it.
- Methods: decision-table
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/run/honors-configured-rule-severities.spec.ts`](../packages/core/workspace-lint/src/run/honors-configured-rule-severities.spec.ts)

##### Lint fails a normal run on errors and a strict run on warnings as well

- Requirement: `cli/lint/normal-and-strict-runs-fail-by-severity`
- Owner: `workspace-lint`
- Statement: When lint finishes, a normal run shall fail only when an error finding exists, a --strict run shall fail when an error or warning finding exists, and both runs shall succeed on informational or no findings while reporting the same findings and summary.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Boundary rationale: The pass/fail verdict is the feature's own typed outcome; mapping it onto a process exit code is the CLI's separate rule.
- Methods: decision-table
- Derived from: `cli/lint/honors-configured-rule-severities`
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/run/normal-and-strict-runs-fail-by-severity.spec.ts`](../packages/core/workspace-lint/src/run/normal-and-strict-runs-fail-by-severity.spec.ts)

##### Lint observes only the selected filesystem view

- Requirement: `cli/lint/observes-selected-filesystem-view`
- Owner: `workspace-lint`
- Statement: When lint runs without --fix, it shall evaluate only the selected view — the staged content and its index fingerprint for git-index, the working tree for workspace — report diagnostic locations against the selected workspace rather than any snapshot of it, and leave the Git index unchanged.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Only a real Git index, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index and status were left untouched; an in-memory run has no Git index to observe.
- Methods: example
- Derived from: `cli/lint/reports-facts-without-mutation`
- Open questions: How should an explicit lint path select a nested workspace inside a Git index, and how should user scope combine with a supplied path? Current root-selection precedence remains an implementation observation.
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/run/observes-selected-filesystem-view.spec.ts`](../packages/core/workspace-lint/src/run/observes-selected-filesystem-view.spec.ts)

##### Lint preserves workspace files whether the run succeeds or fails

- Requirement: `cli/lint/reports-facts-without-mutation`
- Owner: `workspace-lint`
- Statement: When lint runs without --fix, it shall preserve every workspace file, directory, symbolic link, and file's contents whether the run succeeds or fails.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The workspace is a real directory of files, directories and symbolic links, so the whole-tree snapshot before and after is the decisive evidence; nothing about the guarantee needs a separate process.
- Methods: example
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/run/reports-facts-without-mutation.spec.ts`](../packages/core/workspace-lint/src/run/reports-facts-without-mutation.spec.ts)

##### The recovery route for a rejected lockfile re-accepts the desired state

- Requirement: `cli/lockfile-rejections-name-recovery-routes`
- Owner: `workspace-sync`
- Statement: When a workspace lockfile is rejected as older than the supported version, following the named recovery route (preserving the file outside its authoritative path, previewing, then applying sync) shall re-accept the desired state into a lockfile at the supported version, and a workspace holding only workspace-authored content shall finish that route without a lockfile.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Supersedes: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Source: [`packages/core/workspace-sync/src/lockfile-rejections-name-recovery-routes.spec.ts`](../packages/core/workspace-sync/src/lockfile-rejections-name-recovery-routes.spec.ts)

##### Browser sign-in completion follows saved credentials

- Requirement: `cli/login/browser-completion-follows-credential-persistence`
- Owner: `registry-auth`
- Statement: For loopback sign-in, AXM shall report browser completion only after issuer validation, successful code exchange, and credential persistence, reporting callback receipt while finishing and terminal recovery on failure.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: platform; selection: per-change
- Boundary rationale: The examples observe the streamed response from the real loopback HTTP listener while exchange and credential storage are controlled through their services.
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/loopback-login.ts`
- Limitation: The HTTP evidence does not establish visual rendering or a real identity-provider round trip. Retires when: Record browser verification of the provider, callback, and terminal result.
- Source: [`packages/supporting/registry-auth/src/browser-completion-follows-credential-persistence.spec.ts`](../packages/supporting/registry-auth/src/browser-completion-follows-credential-persistence.spec.ts)

##### Availability outcomes retain the observed reason

- Requirement: `cli/upgrade/availability-failures-are-attributed`
- Owner: `cli`
- Statement: When installer preparation or availability blocks an upgrade, human and machine results shall agree with the recorded observation, distinguish affirmative absence from indeterminate failure and formula version mismatch, and report mutation and verification as not attempted.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/machine-result-is-upgrade-assessment`
- Source: [`apps/cli/src/root/upgrade/availability-failures-are-attributed.spec.ts`](../apps/cli/src/root/upgrade/availability-failures-are-attributed.spec.ts)

##### Identity inspection recovers an expired stored session

- Requirement: `cli/whoami/refreshes-rejected-stored-credentials`
- Owner: `registry-auth`
- Statement: When the Registry rejects identity credentials with HTTP 401, AXM shall recover a stored session by refreshing and persisting its replacement credentials and retrying once, report authentication required when rejection remains, and leave ambient credentials and other failures without refresh retries.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/identity.ts`
- Open questions: Is this the authority for registry-auth's generic Registry-request 401 recovery, which auth-middleware.ts implements for every authenticated request, or only for identity inspection? cli/registry-management-preserves-authentication-failures asserts no replay for lifecycle and visibility writes holding a stored session, so one of the two must name the credential class it governs.
- Source: [`packages/supporting/registry-auth/src/refreshes-rejected-stored-credentials.spec.ts`](../packages/supporting/registry-auth/src/refreshes-rejected-stored-credentials.spec.ts)

##### Identity inspection shows the active identity and permissions

- Requirement: `cli/whoami/reports-safe-effective-identity`
- Owner: `cli`
- Statement: When authenticated, whoami shall report the handle, Registry, credential type, effective scopes, enforced extension restrictions, and source-backed or unavailable expiry from the canonical Registry identity operation in human and machine output, excluding email, credential identifiers, token material, and internal permission markers.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Source: [`apps/cli/src/root/auth/reports-safe-effective-identity.spec.ts`](../apps/cli/src/root/auth/reports-safe-effective-identity.spec.ts)

##### A withheld release names recovery from the command that withheld it

- Requirement: `cli/withheld-releases-name-recovery-from-the-emitting-command`
- Owner: `cli`
- Statement: When a command withholds or refuses a release under the minimum release age, its diagnostic shall name the recovery routes reachable from that command, including the override flag that command accepts and the declared-exemption route, and shall not name a command the operator did not run.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`apps/cli/src/withheld-releases-name-recovery-from-the-emitting-command.spec.ts`](../apps/cli/src/withheld-releases-name-recovery-from-the-emitting-command.spec.ts)

#### Quality

##### Error reports keep credentials out of diagnostic details

- Requirement: `cli/errors-do-not-disclose-credentials`
- Owner: `cli`
- Statement: AXM shall redact credential values from error reports and their diagnostic details in human and machine output at every supported verbosity level.
- Class: quality (security)
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/machine-output.md`, `apps/cli/src/cli-runtime/handle-error.test.ts`, `apps/cli/src/cli-runtime/json-envelope.test.ts`
- Limitation: These examples exercise production error construction and channel rendering with supplied verbosity settings; they do not establish every command-specific diagnostic producer or global flag combination. Retires when: Bind process evidence for global verbosity selection and review diagnostic producers for values that bypass the shared error boundary.
- Additional evidence: process via [`apps/cli-e2e/src/command.e2e.test.ts`](../apps/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Additional evidence: process via [`apps/cli-e2e/src/smoke.e2e.test.ts`](../apps/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Source: [`apps/cli/src/app-error/errors-do-not-disclose-credentials.spec.ts`](../apps/cli/src/app-error/errors-do-not-disclose-credentials.spec.ts)

#### Constraints

##### Git-index lint requires a resolved project index

- Requirement: `cli/lint/git-index-requires-a-resolved-index`
- Owner: `workspace-lint`
- Statement: When lint selects the Git index outside a Git repository, while its index contains unresolved merge entries, with --scope user, or together with --fix, AXM shall refuse the request explaining why that view cannot be evaluated, without changing the index or the working tree.
- Class: constraint
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: Only a real Git repository driven through the git executable can hold an unmerged index stage, so the refusals and the untouched index and working tree are established against real repositories; the built CLI adjudicates nothing this rule decides.
- Methods: decision-table, example
- Derived from: `cli/lint/observes-selected-filesystem-view`, `packages/core/workspace-lint/src/run/staged-workspace.test.ts`, `apps/cli/help/topics/git-hooks.md`
- Source: [`packages/core/workspace-lint/src/run/git-index-requires-a-resolved-index.spec.ts`](../packages/core/workspace-lint/src/run/git-index-requires-a-resolved-index.spec.ts)

#### Human factors

##### ASCII output changes display symbols while preserving content

- Requirement: `cli/ascii-human-output-preserves-content`
- Owner: `cli`
- Statement: In human output, AXM shall use seven-bit ASCII display symbols without transliterating content when AXM_ASCII is non-empty, TERM is dumb, or the declared locale inputs consistently name non-UTF-8 locales, and shall otherwise use Unicode display symbols when locale inputs are absent or consistently name UTF-8 locales.
- Class: human-factors
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli/src/screen/output-policy.test.ts`, `apps/cli/src/screen/paint-text.test.ts`
- Open questions: Which locale input controls glyph selection when LC_ALL, LC_CTYPE, and LANG disagree? Earlier environment prose described a non-UTF-8 input selecting ASCII, while the resolver and an internal example select Unicode if any input names UTF-8; this requirement does not decide mixed-locale precedence.; Does ASCII output cover animated progress-frame and prompt symbols beyond painted documents? This requirement covers symbols in rendered human documents.
- Limitation: Examples drive production policy, Screen, and painter over recording streams with supplied terminal facts. They cover nonempty status, change, tree, separator, and content examples, not an actual terminal font, locale installation, animated frame, prompt, or every authored document. Retires when: Add platform, progress, prompt, or new document evidence when its distinct display-symbol obligation is allocated.
- Source: [`apps/cli/src/screen/ascii-human-output-preserves-content.spec.ts`](../apps/cli/src/screen/ascii-human-output-preserves-content.spec.ts)

### Goal: agent-interoperability

Configured extensions realize correctly and completely for every configured coding agent's native surfaces.

#### Functional

##### Adding a coding agent records it durably and realizes installed extensions for it

- Requirement: `cli/agents/add/records-membership-and-realizes-outputs`
- Owner: `cli`
- Statement: When a coding agent is added to the workspace, AXM shall record it in the configured agent set and realize installed extensions on its supported native and shared surfaces as permitted by workspace activation and instruction settings in one operation.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Recording membership belongs to the configuration feature and realizing installed extensions to the reconciliation feature, so the application layer that composes both is the lowest layer at which one operation does both; the workspace it writes is a real directory.
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`apps/cli-e2e/src/agent-membership.e2e.test.ts`](../apps/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`apps/cli/src/root/agents/records-membership-and-realizes-outputs.spec.ts`](../apps/cli/src/root/agents/records-membership-and-realizes-outputs.spec.ts)

##### Agent capabilities distinguish native support from AXM integration

- Requirement: `cli/agents/capabilities/describes-native-support-and-axm-integration`
- Owner: `cli`
- Statement: When a person inspects a coding agent’s capabilities, AXM shall report, per extension type, whether the vendor supports it natively and separately whether AXM integrates with it, together with the applicable directory and scopes, and shall report the agent’s lifecycle rather than treating a retired agent as unknown.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The report is assembled from the shipped capability catalog and emitted through the machine Screen; it reads no workspace, so the handler over a captured Screen is the whole subject.
- Methods: example
- Derived from: `apps/cli/src/root/agents/capabilities.test.ts`, `apps/cli/src/root/agents/capabilities.ts`
- Assumptions: Claude Code models native Skill support that AXM integrates with, and a Hook surface AXM writes for it; Pi models a natively-supported, a plugin-only, and an absent surface in one agent.
- Limitation: These cases inspect AXM's catalog report; they do not establish that the named vendors or plugins currently realize the modeled behavior. Retires when: Verify vendor interoperability through separately identified vendor/runtime evidence when making that claim.
- Limitation: The current catalog provides no planned or unknown AXM-support row for this handler to report; those distinctions retain producer-only fixture evidence. Retires when: Exercise a real catalog row or an explicitly controlled production catalog input for each missing report distinction.
- Source: [`apps/cli/src/root/agents/capabilities/describes-native-support-and-axm-integration.spec.ts`](../apps/cli/src/root/agents/capabilities/describes-native-support-and-axm-integration.spec.ts)

##### Removing a coding agent retires it together with the outputs only it reached

- Requirement: `cli/agents/remove/removes-membership-and-owned-outputs`
- Owner: `cli`
- Statement: When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, and shall leave every remaining agent's realization untouched.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Retiring membership belongs to the configuration feature and cleaning up the departing agent's outputs to the reconciliation feature, so the application layer that composes both is the lowest layer at which one operation does both; the outputs it removes are entries in a real directory.
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Assumptions: Claude Code declares its own project skills directory while Amp declares the shared `.agents/skills` directory, so one workspace can hold both a single-claimant and a shared agent surface.
- Additional evidence: process via [`apps/cli-e2e/src/agent-membership.e2e.test.ts`](../apps/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`apps/cli/src/root/agents/removes-membership-and-owned-outputs.spec.ts`](../apps/cli/src/root/agents/removes-membership-and-owned-outputs.spec.ts)

##### Install realizes the extension for every configured agent

- Requirement: `cli/install/realizes-for-every-configured-agent`
- Owner: `extension-lifecycle`
- Statement: When an acquirable extension is installed, AXM shall realize it on every native surface supported for that extension type by the configured agents and on its declared shared surfaces, as permitted by the workspace's activation and instruction settings.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Assumptions: Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/install/realizes-for-every-configured-agent.spec.ts`](../packages/core/extension-lifecycle/src/install/realizes-for-every-configured-agent.spec.ts)

##### MCP servers reach every configured agent that can represent them

- Requirement: `cli/mcps/projects-to-every-configured-agent`
- Owner: `workspace-sync`
- Statement: When an MCP server is configured and enabled, however it entered the workspace — added, authored inline, or adopted from one agent's own native configuration — reconciliation shall write it to the native configuration of every configured agent that can represent it, shall account for every configured agent and report one that cannot represent it as unsupported rather than omitting it, shall write no server that is configured as disabled, and shall remove it from every agent it reached once desired state disables or withdraws it.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/mcps/import/adoption-reaches-every-configured-agent`, `cli/mcps/inline-lifecycle-is-idempotent`, `cli/mcps/inline-authority-is-operation-coherent`, `cli/activation-follows-desired-state`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so two native files observe two agents.; An unmanaged server declared in one agent's own configuration file is the only shape adoption records, so one such declaration stands for every adopted entry.; Amp is catalogued without MCP configuration support, so it stands for any configured agent that cannot represent a server.
- Limitation: The example table does not witness that an agent which can represent the server reads as current after reconciliation. The workspace record this feature can reach reports an agent whose only MCP target is the shared project-scope file as `failed` with reason `projection-missing` once reconciliation has written that file, while the typed inventory document `axm mcps list` renders reports it as current; only the agent with its own configuration file reads current in both. The rows here therefore assert that no configured agent is omitted and that an agent which cannot represent the server is reported unsupported, not the positive current outcome. Retires when: `@agentxm/workspace-inspection` carries a row asserting, on the typed MCP inventory document after a reconciliation, that every configured agent that can represent the server reads `current` — at which point this file cites that row and the two read paths agree.
- Source: [`packages/core/workspace-sync/src/mcps/projects-to-every-configured-agent.spec.ts`](../packages/core/workspace-sync/src/mcps/projects-to-every-configured-agent.spec.ts)

### Goal: authoring-and-creation

Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.

#### Functional

##### Adopt moves an existing package into workspace authorship

- Requirement: `cli/adopt/moves-package-into-workspace-authorship`
- Owner: `extension-authoring`
- Statement: When a person adopts an existing AXM package into an unoccupied authoring location, AXM shall preserve its content in the workspace authoring directory, retain its declared activation (enabling a previously undeclared package), and remove the acquired copy and its external resolution.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Adoption is a decision of the authoring use case over real directories: a temporary project workspace shows the acquired copy gone, the authored copy byte-identical, the declaration rewritten, and the retired lockfile row — none of which a double could stand in for.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/adopt/command.ts`
- Source: [`packages/core/extension-authoring/src/adopt/moves-package-into-workspace-authorship.spec.ts`](../packages/core/extension-authoring/src/adopt/moves-package-into-workspace-authorship.spec.ts)

##### Authoring commands use the project workspace

- Requirement: `cli/authoring-uses-project-workspace`
- Owner: `cli`
- Statement: Commands that create or change authored packages shall operate in the selected project workspace and reject a user-scope selector without changing either workspace.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The registered command tree is where an authoring route declares its project-workspace boundary and declines a scope selector, and it is reachable in process; the built-CLI refusals and the authored content they leave behind are bound evidence at apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts.
- Methods: contract, example
- Derived from: `apps/cli/src/root/scope-contract.ts`, `apps/cli/src/app.test.ts`, `apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts`](../apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts) — Only a real invocation shows a scope selector refused before the command runs and the authored package landing in the selected project directory while a populated user workspace is left untouched.
- Source: [`apps/cli/src/root/authoring-uses-project-workspace.spec.ts`](../apps/cli/src/root/authoring-uses-project-workspace.spec.ts)

##### Creation refuses existing declarations and authored content

- Requirement: `cli/creation-refuses-existing-content`
- Owner: `extension-authoring`
- Statement: When a new-extension command targets a name that is already configured or an authoring directory that already contains content, AXM shall refuse creation without replacing existing files or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The create-only refusal is settled by the creation use case before its transaction opens, so a real project directory shows the typed refusal for every type and a byte-identical tree.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/create-preflight.ts`, `packages/core/extension-authoring/src/create/create-extension.ts`
- Source: [`packages/core/extension-authoring/src/creation-refuses-existing-content.spec.ts`](../packages/core/extension-authoring/src/creation-refuses-existing-content.spec.ts)

##### Creation uses the configured workspace owner

- Requirement: `cli/creation-uses-configured-workspace-ownership`
- Owner: `extension-authoring`
- Statement: When a person creates an extension, AXM shall use the owner configured in the selected workspace scope, accept an explicitly requested owner with or without its leading @, record an explicitly requested owner as that scope's owner when it configures none, and refuse creation before changing workspace content when no owner is configured and none is requested or when the requested owner differs from the configured one; every applied creation leaves the scope's configured owner equal to the created package's owner, and a previewed creation records none.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Ownership is one decision the authoring feature makes over the selected scope's settings, so each row is observable in a real project directory: the owner the manifest carries, the owner the settings record, and the byte-identical tree a refusal leaves behind.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/create/authoring-owner.ts`
- Source: [`packages/core/extension-authoring/src/creation-uses-configured-workspace-ownership.spec.ts`](../packages/core/extension-authoring/src/creation-uses-configured-workspace-ownership.spec.ts)

##### Demote returns an authored package to the selected external source

- Requirement: `cli/demote/replaces-workspace-source-with-selected-source`
- Owner: `extension-lifecycle`
- Statement: When a person demotes a workspace-authored extension to a valid external source, AXM shall replace workspace source authority with that source and its content while preserving the configured activation state, and shall refuse a workspace replacement source or a target that is not workspace authored.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/demote/command.test.ts`
- Assumptions: Pack and MCP transitions use registry sources and the other types use local sources; additional registry and Git acquisition behavior is verified by its owning source requirements.
- Source: [`packages/core/extension-lifecycle/src/demote/replaces-workspace-source-with-selected-source.spec.ts`](../packages/core/extension-lifecycle/src/demote/replaces-workspace-source-with-selected-source.spec.ts)

##### Fork creates a distinct workspace package while preserving its source

- Requirement: `cli/fork/creates-distinct-workspace-package`
- Owner: `extension-authoring`
- Statement: When a person forks one managed AXM package, AXM shall preserve the source and its reusable content while creating a workspace-authored package of the same type under the requested identity, initially disabled unless activation is requested or already configured.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Forking is a decision of the authoring use case: it reads a real package from a real directory and publishes a real canonical package, so a temporary project workspace observes every byte the operation copied, rewrote, and left alone.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/fork-package.test.ts`, `apps/cli/src/root/fork/command.ts`
- Source: [`packages/core/extension-authoring/src/fork/creates-distinct-workspace-package.spec.ts`](../packages/core/extension-authoring/src/fork/creates-distinct-workspace-package.spec.ts)

##### Fork refuses ambiguous sources and incompatible or occupied destinations

- Requirement: `cli/fork/refuses-ambiguous-or-conflicting-packages`
- Owner: `extension-authoring`
- Statement: When a fork cannot identify one source package of the requested type or its destination already contains content, AXM shall refuse the operation without changing source packages, destination content, or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Each refusal is a decision the fork use case settles before it stages anything, so a real project workspace shows both the typed refusal and that not one byte of the source or the destination moved.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/fork-package.test.ts`, `apps/cli/src/root/fork/command.ts`
- Source: [`packages/core/extension-authoring/src/fork/refuses-ambiguous-or-conflicting-packages.spec.ts`](../packages/core/extension-authoring/src/fork/refuses-ambiguous-or-conflicting-packages.spec.ts)

##### Creating a hook records editable workspace content

- Requirement: `cli/hooks/new/creates-enabled-workspace-content`
- Owner: `extension-authoring`
- Statement: When a person creates a hook, AXM shall create its manifest and a runnable starter entrypoint for the requested runtime in the workspace authoring directory, bind it to the requested event with a matcher only where the event is tool-scoped, register it as enabled workspace-authored content, and project it into the agent hook configurations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The manifest, the entrypoint, the declaration, and the agent hook configuration are all written by the creation use case over the workspace-state services; a real project directory observes each one.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/create/scaffolds/hook.ts`
- Source: [`packages/core/extension-authoring/src/hooks/new/creates-enabled-workspace-content.spec.ts`](../packages/core/extension-authoring/src/hooks/new/creates-enabled-workspace-content.spec.ts)

##### Creating a knowledge bundle records editable workspace content

- Requirement: `cli/knowledge/new/creates-enabled-workspace-content`
- Owner: `extension-authoring`
- Statement: When a person creates a knowledge bundle, AXM shall create its manifest declaring the Open Knowledge Format and its bundle root, create a starter bundle index under that root, carry a supplied description into the manifest, and register the bundle as enabled workspace-authored content.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The manifest, the bundle index, and the declaration are all written by the creation use case over the workspace-state services; a real project directory observes each one.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/scaffolds/knowledge.ts`
- Source: [`packages/core/extension-authoring/src/knowledge/creates-enabled-workspace-content.spec.ts`](../packages/core/extension-authoring/src/knowledge/creates-enabled-workspace-content.spec.ts)

##### A native MCP server can become an authored package

- Requirement: `cli/mcps/import/creates-authored-package-from-native-server`
- Owner: `extension-authoring`
- Statement: Given one unmanaged native server defined by an HTTP URL and optional non-secret literal headers, mcps import --as shall create a workspace-authored MCP package under the supplied fully qualified MCP name with the same URL and headers, and previewing that conversion, whether or not it would enable the package, shall describe the package, the settings declaration, and the native file it would rewrite while writing none of them.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Reading the native definition, writing a schema-valid manifest under the supplied identity, and recording the workspace declaration are all decisions of the import use case; a real project directory observes each one without a built binary.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/mcps/import.ts`, `apps/cli-e2e/src/fork-import.e2e.test.ts`, `cli/creation-uses-configured-workspace-ownership`, `cli/authoring-uses-project-workspace`
- Open questions: Which native transports and configuration fields beyond the represented HTTP URL and headers must package conversion support without loss?; What selection or refusal behavior is required when discovery finds no eligible server, several distinct servers, or conflicting definitions?; How must package conversion preserve existing input references and credentials? The MCP secret owner governs managed secret storage; these examples use only non-secret literal headers.; May a conversion replace an existing configured connection under the target name, and how should existing authored content be treated? The current configured-source transition is an observation, not a new fallback policy.
- Limitation: These examples verify conversion of connection configuration without contacting the remote MCP service or exercising credentials. Retires when: Add evidence under accepted transport and credential obligations when those additional conversion conditions are decided.
- Source: [`packages/core/extension-authoring/src/import/creates-authored-package-from-native-server.spec.ts`](../packages/core/extension-authoring/src/import/creates-authored-package-from-native-server.spec.ts)

##### Imported packages are enabled only by an explicit request

- Requirement: `cli/mcps/import/package-enablement-is-explicit`
- Owner: `extension-authoring`
- Statement: The --enable option of mcps import shall apply only to --as package conversion, enabling the converted package when supplied and leaving it disabled when omitted.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Activation is carried on the conversion request and settled by the import use case: a real project directory shows the persisted declaration and the native configurations the conversion reconciled, without a built binary.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/mcps/import.ts`, `apps/cli/src/root/mcps/import.test.ts`, `apps/cli-e2e/src/fork-import.e2e.test.ts`, `cli/mcps/projects-to-every-configured-agent`
- Source: [`packages/core/extension-authoring/src/import/package-enablement-is-explicit.spec.ts`](../packages/core/extension-authoring/src/import/package-enablement-is-explicit.spec.ts)

##### Creating an MCP server records editable workspace content

- Requirement: `cli/mcps/new/creates-enabled-workspace-content`
- Owner: `extension-authoring`
- Statement: When a person runs mcps new, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The manifest, the declaration, and the connection's projection are all written by the creation use case over the workspace-state services; a real project directory observes each one.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/scaffolds/mcp-server.ts`
- Source: [`packages/core/extension-authoring/src/mcps/new/creates-enabled-workspace-content.spec.ts`](../packages/core/extension-authoring/src/mcps/new/creates-enabled-workspace-content.spec.ts)

##### Native imports create workspace packages without changing original content

- Requirement: `cli/native-imports-preserve-content-and-source`
- Owner: `extension-authoring`
- Statement: When a person imports native Skill or Subagent content, AXM shall preserve the original source and its instructions while creating the requested workspace package, disabled unless activation is requested or the target is already enabled, and shall reject a managed package or mismatched target type.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Preservation and activation are decisions of the import use case over real files: a temporary project workspace shows the native source byte-identical, the converted package's instructions intact, and the projection present exactly when the import ends up enabled.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/import-native-package.test.ts`, `apps/cli/src/root/import/command.ts`
- Source: [`packages/core/extension-authoring/src/native-imports-preserve-content-and-source.spec.ts`](../packages/core/extension-authoring/src/native-imports-preserve-content-and-source.spec.ts)

##### Adding an installed extension to an authored pack records it as a pack dependency

- Requirement: `cli/packs/add/records-member-as-pack-dependency`
- Owner: `extension-authoring`
- Statement: When a person adds a versioned installed extension to a workspace-authored pack, AXM shall record a dependency whose lower bound is the member’s accepted installed version, or its manifest version when workspace authored.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The version a dependency records is read from the workspace's own accepted resolution or authored manifest, and written into the pack manifest by the membership use case; a real project directory observes both sides.
- Methods: example
- Derived from: `cli/packs/authored-packs-expand-membership`
- Supersedes: `cli/packs/authored-packs-expand-membership`
- Additional evidence: process via [`apps/cli-e2e/src/packs.e2e.test.ts`](../apps/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-authoring/src/packs/add-to-pack-records-member-as-pack-dependency.spec.ts`](../packages/core/extension-authoring/src/packs/add-to-pack-records-member-as-pack-dependency.spec.ts)

##### Pack add selects the requested members without confusing shared names

- Requirement: `cli/packs/add/selects-members-without-ambiguity`
- Owner: `extension-authoring`
- Statement: When adding dependencies to an authored pack, AXM shall resolve the configured pack by its local name or unique full identity, add only members selected by full identity or an unambiguous name or name pattern, and refuse ambiguous or unmatched selections without editing the pack.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Selection is decided by the membership use case over the workspace's own desired state; a real project directory shows both which dependencies the manifest gained and that a refused selection left every byte alone.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/packs/configured-pack-selector.ts`, `packages/core/extension-authoring/src/packs/change-pack-membership.ts`
- Source: [`packages/core/extension-authoring/src/packs/add-to-pack-selects-members-without-ambiguity.spec.ts`](../packages/core/extension-authoring/src/packs/add-to-pack-selects-members-without-ambiguity.spec.ts)

##### Creating a pack records workspace authorship with an empty dependency graph

- Requirement: `cli/packs/new/records-workspace-authorship`
- Owner: `extension-authoring`
- Statement: When a person creates a workspace-authored pack, AXM shall record it in workspace settings as workspace authored, write its manifest with an empty dependency graph, and shall not record an accepted resolution for it.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Authorship is settings-authoritative: the declaration, the manifest, and the absence of an accepted resolution are all decided by the creation use case over the workspace-state services.
- Methods: example
- Derived from: `cli/packs/authored-packs-expand-membership`
- Supersedes: `cli/packs/authored-packs-expand-membership`
- Additional evidence: process via [`apps/cli-e2e/src/packs.e2e.test.ts`](../apps/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-authoring/src/packs/new-pack-records-workspace-authorship.spec.ts`](../packages/core/extension-authoring/src/packs/new-pack-records-workspace-authorship.spec.ts)

##### Pack remove changes only the selected dependency declarations

- Requirement: `cli/packs/remove/removes-only-selected-dependencies`
- Owner: `extension-authoring`
- Statement: When a person removes matching dependencies from a workspace-authored pack, AXM shall remove only those manifest entries while preserving installed member content and direct workspace declarations, and shall refuse an unmatched selector or an externally sourced pack without changing the manifest.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The manifest edit and everything it must leave alone — acquired member content, settings, the lockfile — are all observable in a real project directory the membership use case writes through.
- Methods: example, decision-table
- Derived from: `packages/core/extension-authoring/src/packs/remove-from-pack.test.ts`, `packages/core/extension-authoring/src/packs/change-pack-membership.ts`
- Source: [`packages/core/extension-authoring/src/packs/remove-from-pack-removes-only-selected-dependencies.spec.ts`](../packages/core/extension-authoring/src/packs/remove-from-pack-removes-only-selected-dependencies.spec.ts)

##### Unpack keeps members installed as direct declarations

- Requirement: `cli/packs/unpack/promotes-members-without-overwriting-direct-intent`
- Owner: `extension-lifecycle`
- Statement: When a person unpacks a configured pack with complete member resolutions, AXM shall preserve its installed leaf members as direct workspace declarations, retain existing direct declarations unchanged, and remove the pack declaration.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`packages/core/extension-lifecycle/src/packs/unpack-promotes-members-without-overwriting-direct-intent.spec.ts`](../packages/core/extension-lifecycle/src/packs/unpack-promotes-members-without-overwriting-direct-intent.spec.ts)

##### Unpack refuses missing packs and members without usable resolutions

- Requirement: `cli/packs/unpack/refuses-incomplete-membership`
- Owner: `extension-lifecycle`
- Statement: When a requested pack is absent or its membership and accepted member identities cannot be established, AXM shall refuse unpacking without changing workspace declarations, installed content, or accepted resolutions.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`packages/core/extension-lifecycle/src/packs/unpack-refuses-incomplete-membership.spec.ts`](../packages/core/extension-lifecycle/src/packs/unpack-refuses-incomplete-membership.spec.ts)

##### Creating a rule records editable workspace content

- Requirement: `cli/rules/new/creates-enabled-workspace-content`
- Owner: `extension-authoring`
- Statement: When a person creates a rule, AXM shall create its manifest and starter body in the workspace authoring directory, carry the requested title into both, register it as enabled workspace-authored content, and project it into the shared instruction surface agents read.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The manifest, the body, the declaration, and the instruction projection are all written by the creation use case over the workspace-state services; a real project directory observes each one.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/scaffolds/rule.ts`
- Source: [`packages/core/extension-authoring/src/rules/new/creates-enabled-workspace-content.spec.ts`](../packages/core/extension-authoring/src/rules/new/creates-enabled-workspace-content.spec.ts)

##### A new skill is scaffolded for the universal location and every configured agent

- Requirement: `cli/skills/new/scaffolds-for-every-configured-agent`
- Owner: `extension-authoring`
- Statement: When a skill is created, AXM shall create its manifest, content, and enabled settings entry together, shall materialize it for the universal location and every configured agent that can represent it, and shall list the same locations in preview and apply.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `agent-interoperability`, `safe-repetition`
- Boundary: memory; selection: per-change
- Boundary rationale: Creation is decided and executed inside extension-authoring over the workspace-state services; a real project directory observes the files an author would see without running the built CLI.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/create-extension.ts`, `apps/cli-e2e/src/cli-commands/skills/new/command.e2e.ts`
- Assumptions: Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.
- Source: [`packages/core/extension-authoring/src/skills/new/scaffolds-for-every-configured-agent.spec.ts`](../packages/core/extension-authoring/src/skills/new/scaffolds-for-every-configured-agent.spec.ts)

##### A new subagent is scaffolded and rendered for every configured agent

- Requirement: `cli/subagents/new/scaffolds-for-every-configured-agent`
- Owner: `extension-authoring`
- Statement: When a subagent is created, AXM shall create its manifest, content, and enabled settings entry together, shall render it for every configured agent that can represent it, and shall report the same package and declaration targets in preview and apply.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `agent-interoperability`, `safe-repetition`
- Boundary: memory; selection: per-change
- Boundary rationale: Creation is decided and executed inside extension-authoring over the workspace-state services; a real project directory observes the renderings an author would see without running the built CLI.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/create-extension.ts`, `cli/skills/new/scaffolds-for-every-configured-agent`
- Assumptions: Claude Code and Cursor both render project-scope subagents into distinct directories, so two rendered files observe two configured agents.; A subagent's rendered agent files are not listed as creation targets; the created package, its content, and its declaration are. Preview and apply therefore compare that set.
- Source: [`packages/core/extension-authoring/src/subagents/new/scaffolds-for-every-configured-agent.spec.ts`](../packages/core/extension-authoring/src/subagents/new/scaffolds-for-every-configured-agent.spec.ts)

##### Version argument errors offer a command that corrects the request

- Requirement: `cli/version/argument-errors-offer-runnable-recovery`
- Owner: `cli-e2e`
- Statement: When a version request for a matching workspace-authored package omits the exact version required by set or supplies one with another supported bump, AXM shall reject it as invalid usage without changing workspace content and suggest a runnable command on the root version route that corrects the arguments while preserving the selected package and bump.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: A built CLI process establishes the published error classification and executes its suggested command through the registered parser; calling a version handler alone cannot establish that recovery uses an available command route.
- Methods: example, decision-table
- Derived from: `cli/version/refuses-invalid-or-unowned-targets`, `apps/cli/src/root/version/command.ts`
- Source: [`apps/cli-e2e/src/version-argument-errors-offer-runnable-recovery.spec.ts`](../apps/cli-e2e/src/version-argument-errors-offer-runnable-recovery.spec.ts)

##### Version changes the selected authored manifest while preserving other content

- Requirement: `cli/version/changes-only-the-authored-manifest-version`
- Owner: `extension-authoring`
- Statement: When a person requests a supported version change for a workspace-authored extension, AXM shall update only that package manifest version to the requested semantic version, preserve other manifest fields and files, and leave bytes unchanged when the requested version is already current.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The version write runs inside the workspace transaction the use case opens, so a real project directory shows which bytes moved: the one manifest field, and nothing else in the package, the settings, or the lockfile.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/version/command.ts`
- Source: [`packages/core/extension-authoring/src/version/changes-only-the-authored-manifest-version.spec.ts`](../packages/core/extension-authoring/src/version/changes-only-the-authored-manifest-version.spec.ts)

##### Version refuses invalid versions and packages outside workspace authorship

- Requirement: `cli/version/refuses-invalid-or-unowned-targets`
- Owner: `extension-authoring`
- Statement: When a version request has an invalid target identity or version, or does not identify a matching workspace-authored package, AXM shall refuse it without changing package content or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Every one of these refusals is settled by the version use case before its transaction opens, so a real project workspace shows the typed refusal and a byte-identical tree.
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/version/command.ts`
- Source: [`packages/core/extension-authoring/src/version/refuses-invalid-or-unowned-targets.spec.ts`](../packages/core/extension-authoring/src/version/refuses-invalid-or-unowned-targets.spec.ts)

### Goal: extension-adoption

People and agents can find, install, update, and remove reusable extensions across coding agents through dependable product surfaces.

#### Functional

##### Discover identifies local recommendations when Registry lookup fails

- Requirement: `cli/discover/identifies-local-only-recommendations`
- Owner: `extension-discovery`
- Statement: When the Registry cannot supply companion recommendations, AXM shall retain valid package-declared recommendations and explicitly report that Registry results are unavailable.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/discover/handler.test.ts`, `packages/core/extension-discovery/src/discover.ts`
- Open questions: How should local-only recommendations represent unresolved Registry identity and install version? The current fallback supplies resolved true and a synthetic 0.0.0 version; this requirement does not accept those values as verified Registry facts.
- Source: [`packages/core/extension-discovery/src/discover/identifies-local-only-recommendations.spec.ts`](../packages/core/extension-discovery/src/discover/identifies-local-only-recommendations.spec.ts)

##### Discover reports companions for actual project dependencies

- Requirement: `cli/discover/reports-companions-for-detected-dependencies`
- Owner: `extension-discovery`
- Statement: When discovering companion extensions, AXM shall report Registry recommendations only for dependencies detected in the selected project, including their observed package versions and the Registry-provided attestation information.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/discover/handler.test.ts`, `packages/core/extension-discovery/src/discover.test.ts`
- Source: [`packages/core/extension-discovery/src/discover/reports-companions-for-detected-dependencies.spec.ts`](../packages/core/extension-discovery/src/discover/reports-companions-for-detected-dependencies.spec.ts)

##### Root install and the type command express the same durable intent

- Requirement: `cli/install-forms-express-same-intent`
- Owner: `extension-lifecycle`
- Statement: When the same extension is installed, and then reinstalled at the same constraint, through the root install form and through its type-specific install form, both forms shall produce identical workspace configuration, identical canonical content, identical agent projections, and the same reported outcome.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/install/reinstall-is-idempotent`
- Supersedes: `cli/install/root-and-type-forms-express-same-intent`
- Source: [`packages/core/extension-lifecycle/src/install/install-forms-express-same-intent.spec.ts`](../packages/core/extension-lifecycle/src/install/install-forms-express-same-intent.spec.ts)

##### Installing an extension places its source content in the workspace

- Requirement: `cli/install/materializes-canonical-content`
- Owner: `extension-lifecycle`
- Statement: When a person installs an acquirable extension, the install shall materialize the extension's canonical content inside the workspace's managed extension tree.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/install/materializes-canonical-content.spec.ts`](../packages/core/extension-lifecycle/src/install/materializes-canonical-content.spec.ts)

##### Browser sign-in uses the selected Registry's paired web origin

- Requirement: `cli/login/uses-matching-hosted-authorization-origin`
- Owner: `registry-auth`
- Statement: When browser sign-in targets a Registry, AXM shall derive the authorization request origin and the expected callback issuer from that Registry's own origin, for the hosted Registries and for the paired local development surface.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/login/browser-sign-in-uses-the-local-web-surface`
- Supersedes: `cli/login/browser-sign-in-uses-the-local-web-surface`
- Assumptions: The hosted Registry and web origins are configured as the environment pairs exercised here.
- Limitation: In-memory evidence verifies request routing and issuer selection but does not establish availability of the deployed authorization endpoint, browser launch, callback exchange, or credential persistence. Retires when: Released CLI browser sign-in is verified against each deployed environment, and these examples are combined with live loopback journey evidence and cli/login/browser-completion-follows-credential-persistence.
- Source: [`packages/supporting/registry-auth/src/uses-matching-hosted-authorization-origin.spec.ts`](../packages/supporting/registry-auth/src/uses-matching-hosted-authorization-origin.spec.ts)

##### One registry MCP source supports multiple independently named local connections

- Requirement: `cli/mcps/install/local-connection-names-share-source-resolution`
- Owner: `extension-lifecycle`
- Statement: Installing a Registry MCP server under a local name with --as shall add one connection per name, sharing one accepted resolution per source, and shall use each local name verbatim as the agent-native key.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/extension-lifecycle/src/mcps/install/local-connection-names-share-source-resolution.spec.ts`](../packages/core/extension-lifecycle/src/mcps/install/local-connection-names-share-source-resolution.spec.ts)

##### Skill installation selects the requested skills from a source

- Requirement: `cli/skills/install/selects-requested-source-skills`
- Owner: `extension-lifecycle`
- Statement: For an installable source containing several skills, a request that names one or more skills shall install exactly the named skills when every name exists in the source, and a request that selects all of them shall install every discovered skill without opening a selection interaction.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/core/extension-lifecycle/src/skills/install/select-skills.ts`, `apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts`
- Open questions: Does a named skill promise glob matching, and what matching grammar applies?; Must a request containing both matched and unmatched names fail as a whole or install its matches, and how should a wholly unmatched request be reported?; Does unattended operation with neither a name selection nor an all selection select every discovered skill?; How should an all selection and a name selection be combined or refused when both are supplied?
- Limitation: The source population is a local native .agents/skills tree with three valid uniquely named skills. These examples do not establish discovery or selection through remote Git/Registry providers, collision handling, invalid sibling packages, or an actual interactive terminal session. Retires when: Add distinct source-provider and interaction evidence when those selection conditions are allocated; keep unresolved selector policies explicit until decided.
- Source: [`packages/core/extension-lifecycle/src/skills/install/selects-requested-source-skills.spec.ts`](../packages/core/extension-lifecycle/src/skills/install/selects-requested-source-skills.spec.ts)

##### Uninstall removes direct intent and keeps state another desired route still reaches

- Requirement: `cli/uninstall/removes-direct-route-and-recomputes-reachability`
- Owner: `extension-lifecycle`
- Statement: When a directly desired extension is uninstalled, AXM shall remove its direct configuration from axm.json, shall remove its resolution, acquired content whose ownership AXM can verify, and owned projections only when no other desired route still reaches it, reporting retained state otherwise, and shall leave every other desired extension's state untouched.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`apps/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../apps/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Additional evidence: process via [`apps/cli-e2e/src/root-uninstall.e2e.test.ts`](../apps/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts`](../packages/core/extension-lifecycle/src/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts)

##### Update advances the accepted resolution within durable intent

- Requirement: `cli/update/advances-resolution-within-intent`
- Owner: `extension-lifecycle`
- Statement: Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within the durable constraint without changing axm.json or any other extension, and shall be a no-op when already current.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`apps/cli-e2e/src/http-registry.e2e.test.ts`](../apps/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Additional evidence: process via [`apps/cli-e2e/src/skills.e2e.test.ts`](../apps/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`packages/core/extension-lifecycle/src/update/advances-resolution-within-intent.spec.ts`](../packages/core/extension-lifecycle/src/update/advances-resolution-within-intent.spec.ts)

##### An explicit type selects the local name's configured identity

- Requirement: `cli/view/explicit-type-selects-the-local-identity`
- Owner: `workspace-inspection`
- Statement: When metadata is requested for an installed extension by local name with an explicit type, AXM shall use the Registry identity the workspace configured for that name and type, in preference to a same-named entry of another type and to any accepted resolution recorded for another owner.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-inspection/src/view/view-extension.ts`, `packages/supporting/extension-sources/src/resolve-identifier.ts`
- Open questions: Without an explicit type, the current local-name fallback searches only skills and subagents. Whether bare-name lookup should search every non-container type is undecided; this requirement covers the explicit type selector.
- Source: [`packages/core/workspace-inspection/src/view/explicit-type-selects-the-local-identity.spec.ts`](../packages/core/workspace-inspection/src/view/explicit-type-selects-the-local-identity.spec.ts)

##### View offers the extension type’s install command

- Requirement: `cli/view/offers-the-type-install-command`
- Owner: `cli`
- Statement: When viewing an installable extension, AXM shall offer an install command on the route that extension type's command group registers, so the suggestion can be run as printed.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/src/app.ts`, `packages/core/workspace-inspection/src/view/view-extension.ts`
- Source: [`apps/cli/src/root/view/offers-the-type-install-command.spec.ts`](../apps/cli/src/root/view/offers-the-type-install-command.spec.ts)

##### Public metadata can be viewed without management access

- Requirement: `cli/view/public-metadata-requires-no-management-access`
- Owner: `workspace-inspection`
- Statement: When viewing public extension metadata through the default Registry, AXM shall complete the read without a workspace, credentials, or a protected visibility-management request.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/view/handler.test.ts`, `packages/core/workspace-inspection/src/view/view-extension.ts`
- Source: [`packages/core/workspace-inspection/src/view/public-metadata-requires-no-management-access.spec.ts`](../packages/core/workspace-inspection/src/view/public-metadata-requires-no-management-access.spec.ts)

##### View retrieves metadata from the selected Registry

- Requirement: `cli/view/reads-the-selected-registry`
- Owner: `workspace-inspection`
- Statement: When viewing an extension, AXM shall retrieve its metadata from the explicitly named Registry or the configured default Registry when no name is supplied.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/view/handler.test.ts`, `packages/core/workspace-inspection/src/view/view-extension.ts`
- Source: [`packages/core/workspace-inspection/src/view/reads-the-selected-registry.spec.ts`](../packages/core/workspace-inspection/src/view/reads-the-selected-registry.spec.ts)

##### View reports deprecation and replacement availability

- Requirement: `cli/view/reports-deprecation-and-replacement-availability`
- Owner: `workspace-inspection`
- Statement: When viewing a deprecated extension, AXM shall report its deprecation guidance while identifying an unavailable replacement without inventing a replacement identity.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/view/handler.test.ts`, `packages/core/workspace-inspection/src/view/view-extension.ts`
- Source: [`packages/core/workspace-inspection/src/view/reports-deprecation-and-replacement-availability.spec.ts`](../packages/core/workspace-inspection/src/view/reports-deprecation-and-replacement-availability.spec.ts)

##### View reports missing metadata without a success result

- Requirement: `cli/view/reports-missing-targets-and-fields`
- Owner: `workspace-inspection`
- Statement: When an extension or requested metadata field is unavailable, AXM shall report the missing target or field without emitting a successful metadata result.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/view/handler.test.ts`, `packages/core/workspace-inspection/src/view/view-extension.ts`
- Source: [`packages/core/workspace-inspection/src/view/reports-missing-targets-and-fields.spec.ts`](../packages/core/workspace-inspection/src/view/reports-missing-targets-and-fields.spec.ts)

### Goal: knowledge-access

People and agents can discover concepts, commands, and contracts from the surface they are already using.

#### Functional

##### Every supported command describes its invocation and purpose

- Requirement: `cli/command-help-is-complete`
- Owner: `cli`
- Statement: Every supported command shall present help identifying its invocation and purpose, the rendered help tree shall list exactly the supported command paths, and a help request shall reply without reading or changing project or user workspace state, even when that state is malformed.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Boundary rationale: The registered command tree is where help completeness is decided, and it is reachable in process; the malformed-workspace clause needs a real invocation and is bound evidence at apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts.
- Methods: model, example
- Derived from: `cli/command-help-is-complete-and-alias-free`, `apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts`
- Supersedes: `cli/command-help-is-complete-and-alias-free`
- Additional evidence: process via [`apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts`](../apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts) — A registered-tree walk cannot show what a help request does to a populated workspace; only a real invocation against malformed project and user state shows the reply arriving unchanged and nothing being written.
- Source: [`apps/cli/src/command-help-is-complete.spec.ts`](../apps/cli/src/command-help-is-complete.spec.ts)

##### Continuation cursors preserve query and corpus identity

- Requirement: `cli/knowledge/concepts/cursors-bind-query-and-corpus`
- Owner: `knowledge-query`
- Statement: When continuing a Knowledge query, AXM shall return the next page without repeating prior concepts only while the cursor is well formed, no more than twenty-four hours old, and bound to the same query and selected corpus, otherwise requiring the caller to restart.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-index.test.ts`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/index/cursors-bind-query-and-corpus.spec.ts`](../packages/core/knowledge-query/src/index/cursors-bind-query-and-corpus.spec.ts)

##### Conditional retrieval detects source changes

- Requirement: `cli/knowledge/concepts/get/rejects-changed-revision`
- Owner: `knowledge-query`
- Statement: When a caller supplies a previously observed content revision for Knowledge retrieval, AXM shall return the concept only if its current source revision matches and otherwise report a revision conflict with the current revision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/get/rejects-changed-revision.spec.ts`](../packages/core/knowledge-query/src/get/rejects-changed-revision.spec.ts)

##### Query evidence respects requested bounds

- Requirement: `cli/knowledge/concepts/query/bounds-concept-evidence`
- Owner: `knowledge-query`
- Statement: When a Knowledge query matches a concept through several fields or passages, AXM shall return one concept result with matching-field and source-location evidence within the caller-selected passage-count and passage-length bounds.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-index.test.ts`
- Open questions: What explanatory information should query --explain promise about why concepts matched and their ordering? The current strategy and numeric ranking weights are implementation evidence, not accepted output obligations.
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/index/bounds-concept-evidence.spec.ts`](../packages/core/knowledge-query/src/index/bounds-concept-evidence.spec.ts)

##### Query filters jointly select matching concepts

- Requirement: `cli/knowledge/concepts/query/combines-typed-filters`
- Owner: `knowledge-query`
- Statement: When a Knowledge query supplies text, field, property, metadata, lifecycle, tag, or bundle filters, AXM shall return only concepts satisfying every supplied filter with the selected operator.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-index.test.ts`, `apps/cli/src/root/knowledge/concepts/query.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/query/combines-typed-filters.spec.ts`](../packages/core/knowledge-query/src/query/combines-typed-filters.spec.ts)

##### Enumeration selects ordinary current concepts by default

- Requirement: `cli/knowledge/concepts/query/enumerates-selected-document-kinds`
- Owner: `knowledge-query`
- Statement: When a Knowledge query has no text expression, AXM shall enumerate nondeprecated ordinary concepts in stable bundle and concept order unless the caller explicitly selects another document kind or lifecycle status.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-index.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/index/enumerates-selected-document-kinds.spec.ts`](../packages/core/knowledge-query/src/index/enumerates-selected-document-kinds.spec.ts)

##### Invalid query filters fail validation

- Requirement: `cli/knowledge/concepts/query/rejects-invalid-filters`
- Owner: `knowledge-query`
- Statement: When a Knowledge query contains an unknown field, malformed property pointer, unsupported operator, or empty filter value, AXM shall reject the query as a validation failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `apps/cli/src/root/knowledge/concepts/query.ts`
- Source: [`packages/core/knowledge-query/src/query/rejects-invalid-filters.spec.ts`](../packages/core/knowledge-query/src/query/rejects-invalid-filters.spec.ts)

##### Discovery reads only enabled bundles in the selected workspace

- Requirement: `cli/knowledge/concepts/reads-only-enabled-selected-corpus`
- Owner: `knowledge-query`
- Statement: When discovering Knowledge, AXM shall read the enabled bundles in the selected workspace regardless of instruction-entry visibility and reflect current source content without changing workspace state.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/workspace-projection/src/knowledge/installed-bundles.ts`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Limitation: This evidence observes the selection rule in a project workspace only. Which workspace a scope argument routes to, and that the unselected scope is neither read into the corpus nor written, are not observed here. Retires when: A user-scope Knowledge discovery example exists in apps/cli-e2e/src/knowledge.e2e.test.ts, or cli/installed-state-stays-in-selected-scope is revised to name Knowledge discovery reads.
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/corpus/reads-only-enabled-selected-corpus.spec.ts`](../packages/core/knowledge-query/src/corpus/reads-only-enabled-selected-corpus.spec.ts)

##### Discovery refuses an unstable source view

- Requirement: `cli/knowledge/concepts/refuses-changing-corpus`
- Owner: `knowledge-query`
- Statement: When Knowledge source bytes continue changing during capture, AXM shall report a corpus-changing conflict instead of returning results from an inconsistent source view.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/knowledge-query/src/knowledge-capture.test.ts`, `packages/core/knowledge-query/src/knowledge-revision.test.ts`, `packages/core/knowledge-query/src/corpus/installed-corpus.ts`
- Source: [`packages/core/knowledge-query/src/corpus/refuses-changing-corpus.spec.ts`](../packages/core/knowledge-query/src/corpus/refuses-changing-corpus.spec.ts)

##### Related concepts follow authored links with evidence

- Requirement: `cli/knowledge/concepts/related/traverses-authored-links`
- Owner: `knowledge-query`
- Statement: When exploring related Knowledge concepts, AXM shall return outgoing links and backlinks within the requested depth with authored-link evidence, suppressing the starting concept, repeated visits, and index backlinks unless requested.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-graph.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/graph/traverses-authored-links.spec.ts`](../packages/core/knowledge-query/src/graph/traverses-authored-links.spec.ts)

##### Human discovery output preserves text without terminal control

- Requirement: `cli/knowledge/concepts/renders-authored-text-safely`
- Owner: `cli`
- Statement: When rendering bundle-authored Knowledge text for a person, AXM shall preserve ordinary text and line structure while displaying terminal-control and bidirectional-control characters as inert escapes.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/knowledge/concepts/terminal-text.ts`, `apps/cli/src/root/knowledge/concepts/terminal-text.test.ts`
- Source: [`apps/cli/src/root/knowledge/concepts/renders-authored-text-safely.spec.ts`](../apps/cli/src/root/knowledge/concepts/renders-authored-text-safely.spec.ts)

##### Exact retrieval does not substitute another concept

- Requirement: `cli/knowledge/concepts/reports-unavailable-exact-references`
- Owner: `knowledge-query`
- Statement: When an exact Knowledge reference is absent from the selected corpus, AXM shall report not found without substituting a similarly named concept.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/knowledge/concepts/get.ts`, `apps/cli/src/root/knowledge/concepts/resolve.ts`, `apps/cli/src/root/knowledge/concepts/related.ts`
- Source: [`packages/core/knowledge-query/src/index/reports-unavailable-exact-references.spec.ts`](../packages/core/knowledge-query/src/index/reports-unavailable-exact-references.spec.ts)

##### Fuzzy resolution requires opt-in and exposes ambiguity

- Requirement: `cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution`
- Owner: `knowledge-query`
- Statement: When resolving text that is not an exact Knowledge reference, AXM shall require explicit fuzzy resolution and return at most ten deterministic candidates without choosing among ambiguous matches.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-graph.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/graph/requires-explicit-fuzzy-resolution.spec.ts`](../packages/core/knowledge-query/src/graph/requires-explicit-fuzzy-resolution.spec.ts)

##### Exact concept references resolve to installed identity

- Requirement: `cli/knowledge/concepts/resolve/resolves-exact-reference`
- Owner: `knowledge-query`
- Statement: When given a compact or canonical HTTPS reference to an installed Knowledge concept, AXM shall resolve the exact concept to its installed bundle version and source revision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/knowledge-graph.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/graph/resolves-exact-reference.spec.ts`](../packages/core/knowledge-query/src/graph/resolves-exact-reference.spec.ts)

##### Search matches the requested lexical expression

- Requirement: `cli/knowledge/concepts/search/matches-lexical-query`
- Owner: `knowledge-query`
- Statement: When searching installed Knowledge, AXM shall match all normalized whole-token terms across searchable fields, contiguous phrases within one field, and exact literals within one field.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/index/matches-lexical-query.spec.ts`](../packages/core/knowledge-query/src/index/matches-lexical-query.spec.ts)

##### Invalid search expressions fail validation

- Requirement: `cli/knowledge/concepts/search/rejects-invalid-query`
- Owner: `knowledge-query`
- Statement: When a Knowledge search expression is empty, has no searchable tokens, or contains an invalid phrase or literal, AXM shall reject it as a validation failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/query/rejects-invalid-query.spec.ts`](../packages/core/knowledge-query/src/query/rejects-invalid-query.spec.ts)

##### Status distinguishes a ready corpus from unstable and unavailable sources

- Requirement: `cli/knowledge/concepts/status/reports-current-corpus-health`
- Owner: `knowledge-query`
- Statement: When reporting Knowledge discovery status, AXM shall distinguish a ready captured corpus, source bytes that keep changing, and stable capture failures, with current counts and identity for readiness or an actionable diagnostic for failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/knowledge-query/src/corpus/corpus-status.ts`, `apps/cli/src/root/knowledge/json-output.test.ts`
- Open questions: When source capture succeeds but OKF inspection contains error findings, should discovery report a ready but unhealthy corpus or refuse that corpus as unavailable?
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/corpus/reports-current-corpus-health.spec.ts`](../packages/core/knowledge-query/src/corpus/reports-current-corpus-health.spec.ts)

##### Knowledge lint reports source findings without changing content

- Requirement: `cli/knowledge/lint/reports-validation-without-mutation`
- Owner: `knowledge-query`
- Statement: When validating installed or explicitly selected authored Knowledge, AXM shall report source-located findings without changing workspace content, returning failure for errors and success for warnings alone.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/knowledge/json-output.test.ts`, `apps/cli-e2e/src/knowledge.e2e.test.ts`, `cli/lint/catalog-is-complete`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/lint/reports-validation-without-mutation.spec.ts`](../packages/core/knowledge-query/src/lint/reports-validation-without-mutation.spec.ts)

##### Knowledge list explains instruction entry inclusion

- Requirement: `cli/knowledge/list/explains-instruction-entry-inclusion`
- Owner: `workspace-inspection`
- Statement: When listing an installed or explicitly disabled Knowledge bundle, AXM shall report whether its entry is included in agent instructions and the effective reason for that decision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-inspection/src/knowledge/list-knowledge.ts`, `apps/cli/help/topics/knowledge.md`, `packages/core/workspace-projection/src/knowledge/instruction-entry.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/workspace-inspection/src/knowledge/explains-instruction-entry-inclusion.spec.ts`](../packages/core/workspace-inspection/src/knowledge/explains-instruction-entry-inclusion.spec.ts)

##### Knowledge inventory counts every inspected document from current source

- Requirement: `cli/knowledge/list/reports-bundle-inspection`
- Owner: `workspace-inspection`
- Statement: When listing Knowledge bundles, AXM shall count every inspected document in the bundle, including its reserved index, and shall re-inspect current source on each listing so concept and diagnostic counts follow repairs.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-inspection/src/knowledge/list-knowledge.ts`, `apps/cli-e2e/src/knowledge.e2e.test.ts`
- Source: [`packages/core/workspace-inspection/src/knowledge/reports-bundle-inspection.spec.ts`](../packages/core/workspace-inspection/src/knowledge/reports-bundle-inspection.spec.ts)

#### Constraints

##### No command is reachable through an alias route

- Requirement: `cli/commands-have-no-alias-routes`
- Owner: `cli`
- Statement: Before public launch, no supported command shall be reachable through an alias route; each command shall answer to exactly one invocation path.
- Class: constraint
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/command-help-is-complete-and-alias-free`
- Supersedes: `cli/command-help-is-complete-and-alias-free`
- Open questions: The alias prohibition is phrased as a pre-launch condition in its scenario; whether alias routes stay prohibited after public launch is unresolved.
- Limitation: The evidence establishes the pre-launch command surface only; it cannot establish whether alias routes remain prohibited after public launch. Retires when: Public launch, when the alias-route policy is decided and this specification is revised or retired.
- Source: [`apps/cli/src/commands-have-no-alias-routes.spec.ts`](../apps/cli/src/commands-have-no-alias-routes.spec.ts)

### Goal: machine-automation

Machine consumers can drive AgentXM surfaces non-interactively with complete, schema-backed results separated from diagnostics.

#### Functional

##### Explicit token sources take precedence over saved sessions

- Requirement: `cli/credentials-follow-explicit-source-precedence`
- Owner: `registry-auth`
- Statement: For commands using the selected Registry, AXM shall use a nonempty AXM_TOKEN before AXM_TOKEN_FILE and a valid token file before saved Registry credentials, refusing an unreadable or empty selected token file instead of silently using a saved session.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/token-resolution.ts`
- Additional evidence: process via [`apps/cli-e2e/src/auth.e2e.test.ts`](../apps/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`packages/supporting/registry-auth/src/credentials-follow-explicit-source-precedence.spec.ts`](../packages/supporting/registry-auth/src/credentials-follow-explicit-source-precedence.spec.ts)

##### Environments without session storage require explicit tokens

- Requirement: `cli/disabled-credential-persistence-requires-explicit-token`
- Owner: `registry-auth`
- Statement: When persisted credentials are disabled, AXM shall refuse sign-in and saved-session authentication with the explicit-token policy failure while allowing commands to use an explicitly supplied environment token.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/credential-store.ts`
- Limitation: The refusal is the typed explicit-token policy failure; that the boundary renders it as `auth_required` naming AXM_TOKEN_FILE is a rendering decision this capability cannot observe, witnessed by apps/cli/src/feature-errors.test.ts. Retires when: An apps/cli specification owns the rendered explicit-token guidance, or the guidance becomes a carried field of the typed failure.
- Source: [`packages/supporting/registry-auth/src/disabled-credential-persistence-requires-explicit-token.spec.ts`](../packages/supporting/registry-auth/src/disabled-credential-persistence-requires-explicit-token.spec.ts)

##### Login preapproval starts a new sign-in over a valid session in every mode

- Requirement: `cli/login/preapproval-requests-new-sign-in`
- Owner: `registry-auth`
- Statement: When a valid registry session already exists, login with preapproval shall start a new sign-in without asking in interactive, machine-output, and non-interactive modes, while login without preapproval shall keep the session and report the kept account in modes that cannot ask and shall ask before replacing it in a mode that can.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/login.ts`
- Limitation: The kept-session outcome carries the Registry host and handle a caller renders; that the rendered guidance names the preapproval command (`axm login --yes`) is a boundary rendering decision this capability cannot observe. Retires when: An apps/cli specification owns the already-signed-in rendering for login, or the rendered suggestion set becomes observable from this capability.
- Source: [`packages/supporting/registry-auth/src/preapproval-requests-new-sign-in.spec.ts`](../packages/supporting/registry-auth/src/preapproval-requests-new-sign-in.spec.ts)

##### Sign-in rejects inconsistent flow options

- Requirement: `cli/login/rejects-inconsistent-flow-options`
- Owner: `cli`
- Statement: When sign-in options combine incompatible start and resume actions or supply a wait timeout without a resume action, AXM shall report usage failure before changing credentials or pending authorization, and shall document the timeout's dependence on resuming.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/auth/login.ts`
- Source: [`apps/cli/src/root/auth/rejects-inconsistent-flow-options.spec.ts`](../apps/cli/src/root/auth/rejects-inconsistent-flow-options.spec.ts)

##### Sign-in resumes only its Registry authorization

- Requirement: `cli/login/resume-requires-matching-pending-authorization`
- Owner: `registry-auth`
- Statement: When login --wait has no pending authorization for the selected Registry, AXM shall report the missing or mismatched authorization without changing saved credentials or another Registry authorization.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Additional evidence: process via [`apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`packages/supporting/registry-auth/src/resume-requires-matching-pending-authorization.spec.ts`](../packages/supporting/registry-auth/src/resume-requires-matching-pending-authorization.spec.ts)

##### Approved device sign-in establishes the selected Registry session

- Requirement: `cli/login/resumes-approved-authorization`
- Owner: `registry-auth`
- Statement: When a pending device authorization is approved, login --wait shall save the issued credentials for its Registry, clear the pending authorization, and make that session available to subsequent commands.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Additional evidence: process via [`apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`packages/supporting/registry-auth/src/resumes-approved-authorization.spec.ts`](../packages/supporting/registry-auth/src/resumes-approved-authorization.spec.ts)

##### Sign-in retains an issued session when identity lookup is unavailable

- Requirement: `cli/login/retains-issued-session-when-identity-unavailable`
- Owner: `registry-auth`
- Statement: When device authorization issues a session but identity lookup is temporarily unavailable, AXM shall retain the usable session without presenting an unverified identity, allowing later identity inspection to report the canonical Registry account.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Source: [`packages/supporting/registry-auth/src/retains-issued-session-when-identity-unavailable.spec.ts`](../packages/supporting/registry-auth/src/retains-issued-session-when-identity-unavailable.spec.ts)

##### Repeated sign-in preserves pending authorization

- Requirement: `cli/login/reuses-pending-authorization`
- Owner: `registry-auth`
- Statement: When a device authorization is unexpired, AXM shall reuse it for the same Registry and equivalent requested scopes, refuse a conflicting request without changing it, and replace it only when restart is explicitly requested.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Source: [`packages/supporting/registry-auth/src/reuses-pending-authorization.spec.ts`](../packages/supporting/registry-auth/src/reuses-pending-authorization.spec.ts)

##### Unattended device sign-in returns the human action

- Requirement: `cli/login/starts-resumable-device-sign-in`
- Owner: `registry-auth`
- Statement: When device sign-in starts unattended, AXM shall retain the pending authorization and return its verification URL, user code, expiry, requested scopes, and resume command without waiting for approval or opening a browser.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Assumptions: Machine output is the presenter consuming the pending device-login document; the application's renderer-backed presenter implements that port contract.
- Additional evidence: process via [`apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`packages/supporting/registry-auth/src/starts-resumable-device-sign-in.spec.ts`](../packages/supporting/registry-auth/src/starts-resumable-device-sign-in.spec.ts)

##### Denied and expired sign-ins leave saved sessions unchanged

- Requirement: `cli/login/terminal-authorization-failures-preserve-credentials`
- Owner: `registry-auth`
- Statement: When a pending device authorization is denied or expires, login --wait shall report the corresponding failure, remove that pending authorization, and leave saved credentials unchanged.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Additional evidence: process via [`apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../apps/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`packages/supporting/registry-auth/src/terminal-authorization-failures-preserve-credentials.spec.ts`](../packages/supporting/registry-auth/src/terminal-authorization-failures-preserve-credentials.spec.ts)

##### A bounded wait leaves sign-in resumable

- Requirement: `cli/login/wait-timeout-preserves-authorization`
- Owner: `registry-auth`
- Statement: When login --wait reaches the requested timeout before authorization completes, AXM shall report pending human approval with resume instructions and preserve the pending authorization and existing credentials.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/device-login.ts`
- Source: [`packages/supporting/registry-auth/src/wait-timeout-preserves-authorization.spec.ts`](../packages/supporting/registry-auth/src/wait-timeout-preserves-authorization.spec.ts)

##### Sign-out removes only the selected Registry session

- Requirement: `cli/logout/erases-selected-registry-credentials`
- Owner: `registry-auth`
- Statement: When logout finds saved credentials, AXM shall remove the selected Registry session even if remote revocation fails, leaving other Registry credentials available.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/logout.ts`
- Source: [`packages/supporting/registry-auth/src/erases-selected-registry-credentials.spec.ts`](../packages/supporting/registry-auth/src/erases-selected-registry-credentials.spec.ts)

##### Publish authorization resumes the exact reviewed publication

- Requirement: `cli/publish/authorization-resumes-the-exact-publication`
- Owner: `registry-auth`
- Statement: When unattended publish has no publication authority, AXM shall persist a private initiator proof, return a human handoff carrying the registry-protocol publish action and no proof, and neither wait nor upload; a resume reference shall resume only that same request with unchanged publication material, a bounded wait shall return the same handoff when it elapses, and resume shall refuse a foreign, different-purpose or query-bearing reference and changed archives or visibility before exchange, exchange only an approved request, and require explicit recovery for denial, expiry or a prior exchange without replacing the request or replaying uploads.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Open questions: Which specification owns the generic human-handoff protocol (an immediate pending handoff unless a bounded wait was requested, resume only the referenced request, never a silent replacement) that this identity, cli/unattended-verification-is-resumable and cli/login/starts-resumable-device-sign-in each restate for their own purpose?
- Limitation: These cases control the Registry boundary and observe typed outcomes; the server owns approval and atomic exchange enforcement, and full publish command evidence separately covers upload settlement. Retires when: Coordinated end-to-end evidence binds persisted CLI resume, server approval and publication outcome recovery.
- Limitation: The exit codes and rendered JSON envelope these outcomes produce (13 pending, 14 expired, 15 denied, 16 wait elapsed, 6 already exchanged) are a boundary mapping this capability cannot observe; they are pinned by apps/cli/src/auth-pending-envelopes.test.ts. Retires when: cli/exit-codes-match-published-reference adopts the publish-authorization exit codes as decisive rows.
- Source: [`packages/supporting/registry-auth/src/publish-authorization-resumes-the-exact-publication.spec.ts`](../packages/supporting/registry-auth/src/publish-authorization-resumes-the-exact-publication.spec.ts)

##### Token creation requests the chosen lifetime and permissions

- Requirement: `cli/token/create/submits-requested-authority`
- Owner: `registry-auth`
- Statement: When creating a token, AXM shall submit the requested name, lifetime, and permission restrictions using the effective credential and report the issued token without replacing the current session.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/tokens.ts`
- Open questions: Which token-lifetime input forms, omitted-input default, and valid range should the CLI guarantee? Command help and parser tests are witnesses for the current forms and default; this requirement allocates submission of the selected lifetime, not an undecided lifetime-input policy.
- Source: [`packages/supporting/registry-auth/src/tokens/create-submits-requested-authority.spec.ts`](../packages/supporting/registry-auth/src/tokens/create-submits-requested-authority.spec.ts)

##### Token listing reports Registry inventory and completeness

- Requirement: `cli/token/list/reports-token-inventory`
- Owner: `cli`
- Statement: When token list succeeds, AXM shall report the Registry token metadata and pagination state without including token secrets.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/auth/token.ts`
- Source: [`apps/cli/src/root/auth/token-list-reports-token-inventory.spec.ts`](../apps/cli/src/root/auth/token-list-reports-token-inventory.spec.ts)

##### Token revocation names the selected credential

- Requirement: `cli/token/revoke/revokes-only-selected-token`
- Owner: `registry-auth`
- Statement: When token revoke is requested, AXM shall request deletion of the selected token identifier using the effective credential and report success only after the Registry accepts deletion.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/tokens.ts`
- Source: [`packages/supporting/registry-auth/src/tokens/revoke-revokes-only-selected-token.spec.ts`](../packages/supporting/registry-auth/src/tokens/revoke-revokes-only-selected-token.spec.ts)

##### Unattended verification returns the same resumable request

- Requirement: `cli/unattended-verification-is-resumable`
- Owner: `registry-auth`
- Statement: When a Registry write no person is guiding requires human verification, AXM shall return a pending-human handoff immediately unless a bounded wait was explicitly requested, identify its purpose, Registry, nonsecret request reference, verification URL, expiry, polling interval and resume instruction, resume only that referenced request with the original inputs without creating a replacement or performing the write before verification, refuse a reference naming another Registry, another purpose, or carrying a query without presenting any credential, and refuse a nonpositive bounded wait before attempting the write.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/registry-writes-complete-required-verification`
- Limitation: The Registry boundary is controlled; server-side action, actor and intent binding enforcement is outside this CLI evidence. Retires when: Deployed Registry conformance evidence verifies rejection of altered action, actor and intent bindings.
- Limitation: That machine output or a missing terminal each make an invocation unattended, and that the pending handoff renders as exit 13 (or 16 when the wait elapses) in the JSON error envelope, are boundary decisions this capability cannot observe; the envelope and exit codes are pinned by apps/cli/src/auth-pending-envelopes.test.ts, and that login does not offer the resume flag by apps/cli/src/cli-flags/human-verification.test.ts. Retires when: cli/exit-codes-match-published-reference adopts the pending-verification exit codes, and one owner states the unattended-invocation rule the write commands each derive today.
- Source: [`packages/supporting/registry-auth/src/step-up/unattended-verification-is-resumable.spec.ts`](../packages/supporting/registry-auth/src/step-up/unattended-verification-is-resumable.spec.ts)

### Goal: platform-reach

AXM works on every supported operating system, runtime, shell, and filesystem.

#### Quality

##### AXM installs through its supported channels with integrity verification

- Requirement: `system/installability/product-installs-through-supported-channels`
- Owner: `cli-e2e`
- Statement: AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum.
- Class: quality (installability)
- Role: experience
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: process; selection: per-change
- Boundary rationale: Primary examples execute the actual shell installer with matching and mismatching download bytes. Bound installed-product evidence executes every supported installer shell with real AXM, including checksum rejection on Windows.
- Methods: example
- Open questions: Must a direct native installer preserve an existing working executable when download verification fails? Existing process observations support that behavior, but this installation requirement only states installation with checksum verification; cli/upgrade/verifies-download-before-replacement separately owns the CLI upgrade promise.
- Limitation: Primary examples use a version-answering fixture on macOS/Linux, proving installer acceptance and refusal without claiming AXM functionality. Real AXM startup and PowerShell/cmd behavior require the complementary installed-product matrix. Retires when: Retain successful real AXM installation and checksum rejection evidence for every supported installer shell and platform.
- Additional evidence: installed via [`apps/cli-e2e/src/install-verification.e2e.test.ts`](../apps/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Source: [`apps/cli-e2e/src/installers/product-installs-through-supported-channels.spec.ts`](../apps/cli-e2e/src/installers/product-installs-through-supported-channels.spec.ts)

#### Human factors

##### Native installers explain how to invoke the installed executable

- Requirement: `system/installability/native-installers-explain-shell-access`
- Owner: `cli-e2e`
- Statement: When PATH does not select the newly installed AXM executable, the native installer shall print commands appropriate to its shell for adding the resolved installation directory to PATH and verifying that executable through its absolute path.
- Class: human-factors
- Role: experience
- Product goals: `platform-reach`
- Boundary: process; selection: per-change
- Boundary rationale: The primary examples execute the actual shell installer and then execute its printed commands against a version-answering fixture; bound installed evidence exercises the commands with real AXM on each supported installer shell.
- Methods: example
- Derived from: `install.md`, `apps/cli/site-content/docs/quickstart.md`, `apps/cli-e2e/src/install-verification.e2e.test.ts`
- Open questions: Must native installers preserve existing shell profile files and persistent user PATH, leaving those edits to explicit user action? The current profile-preservation witness does not itself establish that obligation.
- Limitation: Primary examples exercise POSIX shell commands with a version-answering fixture, not AXM functionality. PowerShell and cmd command behavior remains in the existing real Windows installed-product matrix. Retires when: Retain successful installed-boundary execution of the printed commands against real AXM for every supported shell.
- Additional evidence: installed via [`apps/cli-e2e/src/install-verification.e2e.test.ts`](../apps/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Source: [`apps/cli-e2e/src/installers/native-installers-explain-shell-access.spec.ts`](../apps/cli-e2e/src/installers/native-installers-explain-shell-access.spec.ts)

### Goal: privacy-and-consent

Observation of product use stays within the documented data boundary and under the control of the person being observed.

#### Functional

##### Registry management preserves authentication failures without reporting success

- Requirement: `cli/registry-management-preserves-authentication-failures`
- Owner: `extension-publish`
- Statement: When a Registry lifecycle or visibility command receives an authentication rejection, AXM shall preserve the authentication failure, stop the operation without replaying the rejected request, and emit no successful result.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `AgentXM Registry API 0.1.0`
- Source: [`packages/core/extension-publish/src/lifecycle/registry-management-preserves-authentication-failures.spec.ts`](../packages/core/extension-publish/src/lifecycle/registry-management-preserves-authentication-failures.spec.ts)

##### Challenged Registry writes complete the required verification before retrying

- Requirement: `cli/registry-writes-complete-required-verification`
- Owner: `registry-auth`
- Statement: When a Registry write that a person is guiding, or one explicitly requesting a bounded wait, receives a human-verification challenge, AXM shall present the action, target and verification URL, wait once for that challenge's completion within its lifetime and the requested wait bound, retry the identical write at most once with its verification identifier while preserving every input it carried, and report no success if verification or the retry fails.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `AgentXM Registry API 0.1.0`, `packages/supporting/registry-auth/src/step-up.ts`, `cli/token/completes-required-human-verification`
- Supersedes: `cli/token/completes-required-human-verification`
- Limitation: Token creation and revocation are exercised through their own use cases; the version-lifecycle and visibility writes are exercised as parameterized mutation ports, so that yank, unyank, visibility set and visibility reconcile each compose this capability is not established here. Retires when: extension-publish carries a test proving each lifecycle and visibility command composes runWithStepUp with its observed revision.
- Additional evidence: process via [`apps/cli-e2e/src/auth.e2e.test.ts`](../apps/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`packages/supporting/registry-auth/src/step-up/registry-writes-complete-required-verification.spec.ts`](../packages/supporting/registry-auth/src/step-up/registry-writes-complete-required-verification.spec.ts)

##### Telemetry collection requires the operator's environment consent

- Requirement: `system/security/telemetry-consent-and-precedence`
- Owner: `cli`
- Statement: Telemetry collection shall remain off unless the operator explicitly enables usage or error telemetry through the environment, give the do-not-track convention precedence over every other control, and read no telemetry control from committed workspace configuration.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`apps/cli/src/telemetry/telemetry-consent-and-precedence.spec.ts`](../apps/cli/src/telemetry/telemetry-consent-and-precedence.spec.ts)

#### Quality

##### Telemetry collection or delivery failure is invisible to the operation

- Requirement: `system/reliability/telemetry-failure-never-alters-outcomes`
- Owner: `cli`
- Statement: When telemetry collection or delivery fails for any reason, the requested operation shall complete with the outcome it would have had without telemetry, and the failure shall neither fail nor alter that operation.
- Class: quality (reliability)
- Role: experience
- Product goals: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `system/security/telemetry-failure-never-alters-outcomes`
- Supersedes: `system/security/telemetry-failure-never-alters-outcomes`
- Source: [`apps/cli/src/cli-runtime/telemetry-failure-never-alters-outcomes.spec.ts`](../apps/cli/src/cli-runtime/telemetry-failure-never-alters-outcomes.spec.ts)

### Goal: safe-repetition

Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.

#### Functional

##### Adopt preview describes the authorship transition without changing any state

- Requirement: `cli/adopt/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When adopt runs in preview mode against a canonical package the workspace could author, it shall report the adoption it would apply with a previewed outcome and shall not move the package, create authored content, or change settings or the lockfile.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the adoption use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write — and every move — that could have happened.
- Methods: example
- Source: [`packages/core/extension-authoring/src/adopt/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/adopt/preview-is-pure.spec.ts)

##### Adding an already configured coding agent is a successful no-op

- Requirement: `cli/agents/add/add-is-idempotent`
- Owner: `workspace-configuration`
- Statement: When a coding agent the workspace already configures is added again, AXM shall report a no-op outcome and shall not change the agent set or that agent's realized outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Source: [`packages/core/workspace-configuration/src/membership/add-is-idempotent.spec.ts`](../packages/core/workspace-configuration/src/membership/add-is-idempotent.spec.ts)

##### Agent add preview describes the new membership without changing any state

- Requirement: `cli/agents/add/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When agents add runs in preview mode for a coding agent the workspace does not yet configure, it shall report the membership and realized outputs it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/add/records-membership-and-realizes-outputs`
- Source: [`packages/core/workspace-configuration/src/membership/add-preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/membership/add-preview-is-pure.spec.ts)

##### Agent remove preview describes the departure without changing any state

- Requirement: `cli/agents/remove/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When agents remove runs in preview mode for a configured coding agent, it shall report the membership and owned outputs it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/remove/removes-membership-and-owned-outputs`
- Source: [`packages/core/workspace-configuration/src/membership/remove-preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/membership/remove-preview-is-pure.spec.ts)

##### The archive cache reports its limits and enforces exactly those

- Requirement: `cli/cache/prune/enforces-reported-retention-limits`
- Owner: `registry-client`
- Statement: The archive cache shall report its entry count, byte total, and effective size and age limits, and pruning shall remove expired archives and enough excess archive storage to satisfy exactly those reported limits, preserve unrelated files, and report the removed and remaining entry and byte totals.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/supporting/registry-client/src/archive-cache.ts`
- Supersedes: `cli/cache/status/reports-usage-and-effective-limits`
- Open questions: Should removal of the oldest archives first and the exact expiration boundary be product guarantees? The current implementation chooses both; this requirement establishes the externally reported limits without fixing those choices.
- Source: [`packages/supporting/registry-client/src/archive-cache/enforces-reported-retention-limits.spec.ts`](../packages/supporting/registry-client/src/archive-cache/enforces-reported-retention-limits.spec.ts)

##### Cache verification removes corrupt archives and preserves valid content

- Requirement: `cli/cache/verify/removes-only-corrupt-archives`
- Owner: `registry-client`
- Statement: The cache verify command shall compare every cached archive with its recorded integrity, remove entries whose integrity is invalid or mismatched, retain matching entries and unrelated files, and report the checked, valid, and removed counts.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/supporting/registry-client/src/archive-cache.ts`
- Source: [`packages/supporting/registry-client/src/archive-cache/removes-only-corrupt-archives.spec.ts`](../packages/supporting/registry-client/src/archive-cache/removes-only-corrupt-archives.spec.ts)

##### Concurrent changes to one workspace never interleave

- Requirement: `cli/changes-do-not-interleave`
- Owner: `workspace-transactions`
- Statement: When changes contend for the same workspace, AXM shall prevent one change from applying workspace writes while another is in progress and shall allow a change refused for contention to proceed when retried after the workspace becomes available.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: Separate Node processes overlap while using the published transition and transaction boundaries of @agentxm/workspace-transactions, which is where a change's write window is opened and closed.
- Methods: example
- Source: [`packages/core/workspace-transactions/src/changes-do-not-interleave.spec.ts`](../packages/core/workspace-transactions/src/changes-do-not-interleave.spec.ts)

##### Demote preview describes the replacement without performing it

- Requirement: `cli/demote/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When demote runs in preview mode, it shall report the replacement it would apply with a previewed outcome naming the demotion unit and the workspace-authority risk it carries, and shall not change settings, the lockfile, authored content, or agent projections; and when the named target is not workspace authored it shall report the conflict and change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/extension-lifecycle/src/demote/preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/demote/preview-is-pure.spec.ts)

##### Deprecation rejects contradictory or empty guidance

- Requirement: `cli/deprecate/rejects-conflicting-or-empty-guidance`
- Owner: `extension-publish`
- Statement: The deprecate command shall reject a field supplied together with its clearing flag before contacting the Registry and reject an edit that leaves neither a message nor a replacement before attempting a write.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/lifecycle/command.ts`, `apps/cli/src/root/lifecycle/command.test.ts`
- Source: [`packages/core/extension-publish/src/deprecation/rejects-conflicting-or-empty-guidance.spec.ts`](../packages/core/extension-publish/src/deprecation/rejects-conflicting-or-empty-guidance.spec.ts)

##### Deprecation edits preserve omitted guidance at the observed revision

- Requirement: `cli/deprecate/updates-guidance-at-the-observed-revision`
- Owner: `extension-publish`
- Statement: The deprecate command shall compose the requested message and replacement edits with the observed guidance, preserve omitted and concealed replacement information, condition the write on the observed revision, and report the Registry's acknowledged transition, carrying the publisher guidance the Registry acknowledged.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/lifecycle/command.ts`, `apps/cli/src/root/lifecycle/command.test.ts`
- Limitation: Whether a person sees the acknowledged guidance presented as result information rather than as a warning is the application's rendering of this transition, not the transition itself, so it is not observed here. Retires when: The CLI owns evidence, beside its lifecycle renderer, that acknowledged publisher guidance is presented as information and raises no warning.
- Source: [`packages/core/extension-publish/src/deprecation/updates-guidance-at-the-observed-revision.spec.ts`](../packages/core/extension-publish/src/deprecation/updates-guidance-at-the-observed-revision.spec.ts)

##### Disable preview describes the deactivation without changing any state

- Requirement: `cli/disable/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When disable runs in preview mode against an extension of any managed type — skill, subagent, MCP server, rule, hooks package, Knowledge bundle, or Pack — it shall not change settings, the lockfile, canonical content, agent projections, or any other workspace state; it shall report the deactivation it would apply with a previewed outcome when the extension is enabled, report the request as unchanged when the extension is already disabled, and, when the workspace holds no such extension, refuse the request for a skill, subagent, Knowledge bundle, or Pack and report it as unchanged for an MCP server, rule, or hooks package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`
- Supersedes: `cli/hooks/disable/preview-is-pure`, `cli/knowledge/disable/preview-is-pure`, `cli/mcps/disable/preview-is-pure`, `cli/packs/disable/preview-is-pure`, `cli/rules/disable/preview-is-pure`, `cli/skills/disable/preview-is-pure`, `cli/subagents/disable/preview-is-pure`
- Open questions: Whether an unconfigured target should refuse for every type, or settle as unchanged for every type, is undecided; the policy is split today and the example table records the split as it stands.
- Source: [`packages/core/extension-lifecycle/src/activation/disable-preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/activation/disable-preview-is-pure.spec.ts)

##### Enable preview describes the activation without changing any state

- Requirement: `cli/enable/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When enable runs in preview mode against an extension of any managed type — skill, subagent, MCP server, rule, hooks package, Knowledge bundle, or Pack — it shall not change settings, the lockfile, canonical content, agent projections, or any other workspace state; it shall report the activation it would apply with a previewed outcome when the extension is disabled, report the request as unchanged when the extension is already enabled, and, when the workspace holds no such extension, refuse the request for a skill, subagent, Knowledge bundle, or Pack and report it as unchanged for an MCP server, rule, or hooks package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`
- Supersedes: `cli/hooks/enable/preview-is-pure`, `cli/knowledge/enable/preview-is-pure`, `cli/mcps/enable/preview-is-pure`, `cli/packs/enable/preview-is-pure`, `cli/rules/enable/preview-is-pure`, `cli/skills/enable/preview-is-pure`, `cli/subagents/enable/preview-is-pure`
- Open questions: Whether an unconfigured target should refuse for every type, or settle as unchanged for every type, is undecided; the policy is split today and the example table records the split as it stands.
- Source: [`packages/core/extension-lifecycle/src/activation/enable-preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/activation/enable-preview-is-pure.spec.ts)

##### Fork preview describes the new authored package without changing any state

- Requirement: `cli/fork/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When fork runs in preview mode against a resolvable source package, it shall report the authored package it would create with a previewed outcome and shall not create authored content or change settings, the lockfile, or the source package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the fork use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Source: [`packages/core/extension-authoring/src/fork/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/fork/preview-is-pure.spec.ts)

##### Hook creation preview describes the scaffold without creating any state

- Requirement: `cli/hooks/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When hook creation is previewed for an owner the workspace authors, it shall report the manifest, entrypoint, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent hook configurations; a previewed creation the workspace refuses shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/hooks/new/creates-enabled-workspace-content`
- Source: [`packages/core/extension-authoring/src/hooks/new/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/hooks/new/preview-is-pure.spec.ts)

##### Install preview describes the plan without changing any state

- Requirement: `cli/install/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When an install of any extension type runs in preview mode, it shall not change settings, the lockfile, canonical content, or agent projections; when the request passes the applicable checks and requires workspace changes, it shall report the planned closure with a previewed outcome, including any publisher change the acceptance would make; and when the requested source cannot be resolved, it shall report the problem and still change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/hooks/install/preview-is-pure`, `cli/knowledge/install/preview-is-pure`, `cli/mcps/install/preview-is-pure`, `cli/packs/install/preview-is-pure`, `cli/rules/install/preview-is-pure`, `cli/skills/install/preview-is-pure`, `cli/subagents/install/preview-is-pure`
- Supersedes: `cli/hooks/install/preview-is-pure`, `cli/knowledge/install/preview-is-pure`, `cli/mcps/install/preview-is-pure`, `cli/packs/install/preview-is-pure`, `cli/rules/install/preview-is-pure`, `cli/skills/install/preview-is-pure`, `cli/subagents/install/preview-is-pure`
- Source: [`packages/core/extension-lifecycle/src/install/preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/install/preview-is-pure.spec.ts)

##### Installing an already desired extension at the same constraint is a successful no-op

- Requirement: `cli/install/reinstall-is-idempotent`
- Owner: `extension-lifecycle`
- Statement: When a person reinstalls an extension the workspace already desires at the same constraint, the install shall succeed with a no-op outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Open questions: When installed files differ from the accepted content, should a repeated install restore that content and report a repair, or refuse until the user explicitly chooses recovery? The unchanged-state example does not decide this case.; Applying a satisfied install reports `no-op` while previewing the same request reports `previewed`, because the outcome follows planned units and only execution observes that a unit changes nothing. Should a preview that would change nothing report `no-op`, and if so must every planner decide the satisfied case before planning?
- Additional evidence: process via [`apps/cli-e2e/src/projection-currency.e2e.test.ts`](../apps/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`packages/core/extension-lifecycle/src/install/reinstall-is-idempotent.spec.ts`](../packages/core/extension-lifecycle/src/install/reinstall-is-idempotent.spec.ts)

##### Disabling already disabled instruction-file management is a successful no-op

- Requirement: `cli/instructions/disable/disable-is-idempotent`
- Owner: `workspace-configuration`
- Statement: When instruction-file management is disabled while already disabled, AXM shall report a no-op outcome and shall not change settings.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`packages/core/workspace-configuration/src/instructions/disable-is-idempotent.spec.ts`](../packages/core/workspace-configuration/src/instructions/disable-is-idempotent.spec.ts)

##### Instruction management disable preview describes the removals without changing any state

- Requirement: `cli/instructions/disable/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When instructions disable runs in preview mode for a workspace with managed instruction files, it shall report the recorded choice and owned aliases it would remove with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/disable/removes-only-owned-aliases`
- Open questions: A preview whose request is already satisfied settles as a no-op here because the instructions use case detects 'already current' before planning, while install's satisfied preview reports 'previewed'. The plan-family decision at workspace-operations — whether every planner settles the satisfied case before planning — determines which outcome this example asserts; until then it records current behaviour.
- Source: [`packages/core/workspace-configuration/src/instructions/disable-preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/instructions/disable-preview-is-pure.spec.ts)

##### Enabling the same instruction configuration is a successful no-op

- Requirement: `cli/instructions/enable/enable-is-idempotent`
- Owner: `workspace-configuration`
- Statement: When instruction-file management is enabled with the already-current source file and ignore policy, AXM shall report a no-op and leave settings, source content, aliases and ignore entries unchanged.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-configuration/src/instructions/manage-instructions.ts`
- Source: [`packages/core/workspace-configuration/src/instructions/enable-is-idempotent.spec.ts`](../packages/core/workspace-configuration/src/instructions/enable-is-idempotent.spec.ts)

##### Instruction management enable preview describes the aliases without changing any state

- Requirement: `cli/instructions/enable/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When instructions enable runs in preview mode for a workspace whose instruction files are unmanaged, it shall report the recorded choice and alias files it would create with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/enable/records-choice-and-reconciles-aliases`
- Source: [`packages/core/workspace-configuration/src/instructions/enable-preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/instructions/enable-preview-is-pure.spec.ts)

##### An interrupted workspace change leaves authoritative files whole and names a way back

- Requirement: `cli/interruption-preserves-authority-and-reports-recovery`
- Owner: `cli-e2e`
- Statement: When a workspace change is interrupted, AXM shall leave every authoritative file either wholly as it was or wholly as committed, shall keep closures that had settled committed and restore closures in flight when it can, and shall report the interruption with each unit's disposition and a recovery route, without promising to finish, resume, or roll back the interrupted request.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: Signal delivery, atomic replacement, and lock reclamation are process and filesystem facts an in-memory port cannot establish.
- Methods: example
- Derived from: `cli/mutations-are-closure-atomic`, `docs/architecture/workspace/execution.md`, `docs/architecture/decisions/closure-atomicity-and-recovery.md`
- Additional evidence: process via [`apps/cli-e2e/src/signal-interruption.e2e.test.ts`](../apps/cli-e2e/src/signal-interruption.e2e.test.ts) — Delivers a real signal to the built binary mid-acquisition, so the terminal document, its durable-state disposition, and the signal exit code are observed from outside the process rather than derived from a journal in memory.
- Source: [`apps/cli-e2e/src/interruption-preserves-authority-and-reports-recovery.spec.ts`](../apps/cli-e2e/src/interruption-preserves-authority-and-reports-recovery.spec.ts)

##### Knowledge bundle creation preview describes the scaffold without creating any state

- Requirement: `cli/knowledge/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When knowledge bundle creation is previewed, it shall report the manifest, bundle index, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, or canonical content; a previewed creation refused because the name is already authored shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/knowledge/new/creates-enabled-workspace-content`
- Source: [`packages/core/extension-authoring/src/knowledge/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/knowledge/preview-is-pure.spec.ts)

##### Inline MCP server add preview describes the entry without changing any state

- Requirement: `cli/mcps/add/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When mcps add runs in preview mode for an inline MCP server the workspace does not yet configure, it shall report the settings entry and native realization it would apply with a previewed outcome and shall not change settings, native MCP configuration, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/add/records-and-realizes-inline-configuration`
- Source: [`packages/core/workspace-configuration/src/inline-mcp/add-preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/inline-mcp/add-preview-is-pure.spec.ts)

##### MCP import preview describes the change without changing workspace state

- Requirement: `cli/mcps/import/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When mcps import previews an eligible unmanaged native server, whether it would adopt the server inline or convert it into an authored package under --as, it shall report the change it would apply with a previewed outcome and shall not change settings, the lockfile, any authored package, or any native agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/import/adoption-reaches-every-configured-agent`, `cli/mcps/import/creates-authored-package-from-native-server`
- Source: [`packages/core/workspace-configuration/src/mcp-import/preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/mcp-import/preview-is-pure.spec.ts)

##### Repeating an inline MCP server addition is a successful no-op

- Requirement: `cli/mcps/inline-lifecycle-is-idempotent`
- Owner: `workspace-configuration`
- Statement: When an inline MCP server is added again with an identical definition, whatever transport it carries, or its removal is repeated after it is already gone, AXM shall report a no-op outcome and shall change neither the recorded entry nor its native projection.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/add/records-and-realizes-inline-configuration`, `cli/uninstall/is-idempotent`
- Additional evidence: process via [`apps/cli-e2e/src/command.e2e.test.ts`](../apps/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Source: [`packages/core/workspace-configuration/src/inline-mcp/inline-lifecycle-is-idempotent.spec.ts`](../packages/core/workspace-configuration/src/inline-mcp/inline-lifecycle-is-idempotent.spec.ts)

##### New MCP server preview describes the scaffold without changing any state

- Requirement: `cli/mcps/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When mcps new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write — settings, authored root, and agent MCP config — that could have happened.
- Methods: example
- Derived from: `packages/core/extension-authoring/src/create/scaffolds/mcp-server.ts`
- Source: [`packages/core/extension-authoring/src/mcps/new/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/mcps/new/preview-is-pure.spec.ts)

##### A workspace change that cannot complete leaves each semantic closure either fully committed or fully restored

- Requirement: `cli/mutations-are-closure-atomic`
- Owner: `workspace-operations`
- Statement: When a workspace change cannot complete, AXM shall write nothing for a request refused before application or whose prepared candidate is found stale under the workspace lock, shall restore the settings, lockfile, canonical content, and owned projections that a failed semantic closure had changed while leaving independently settled closures committed, and shall report every closure's outcome and any retained state as a failed operation outcome that automation can distinguish.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Closure execution, rollback, and settlement are decided by the plan pipeline over a real temporary workspace; the durable-file effects the rule is about are observable there without a process boundary.
- Methods: decision-table, example
- Derived from: `docs/architecture/workspace/execution.md`, `docs/architecture/decisions/closure-atomicity-and-recovery.md`
- Assumptions: The nonzero exit an operator observes is the CLI's mapping of these outcomes; cli/exit-codes-match-published-reference owns that mapping and carries the partial and interrupted rows.; The three refusal rows carry the refusal facts of the routes that produce them; the route-level admission grammar is owned by cli/install/non-installable-sources-do-not-mutate.
- Limitation: Remote Registry effects are not restored; cli/publish/outcomes-distinguish-unresolved-uploads owns their reporting. Retires when: The Registry gains a transactional publish contract.
- Source: [`packages/core/workspace-operations/src/plan/mutations-are-closure-atomic.spec.ts`](../packages/core/workspace-operations/src/plan/mutations-are-closure-atomic.spec.ts)

##### Structured native configuration changes follow values rather than formatting

- Requirement: `cli/native-projections-compare-by-decoded-value`
- Owner: `workspace-sync`
- Statement: When a structured native projection is re-serialized with an equivalent decoded value, reconciliation shall report it current and preserve the file, and when its decoded value diverges from the desired configuration, reconciliation shall report the divergence in preview and restore the desired value on apply.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/projection-currency-follows-state-authority`
- Source: [`packages/core/workspace-sync/src/native-projections-compare-by-decoded-value.spec.ts`](../packages/core/workspace-sync/src/native-projections-compare-by-decoded-value.spec.ts)

##### Pack add preview describes the dependency without changing any state

- Requirement: `cli/packs/add/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When packs add runs in preview mode against an installed extension, it shall report the dependency it would record with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any installed content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the membership use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/packs/add/records-member-as-pack-dependency`
- Source: [`packages/core/extension-authoring/src/packs/add-to-pack-preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/packs/add-to-pack-preview-is-pure.spec.ts)

##### Pack creation preview describes the scaffold without creating any state

- Requirement: `cli/packs/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When pack creation is previewed, it shall report the manifest and settings entry it would create with a previewed outcome and shall not create the authored package or record the pack; a previewed creation refused because the pack is already authored shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/packs/new/records-workspace-authorship`
- Source: [`packages/core/extension-authoring/src/packs/new-pack-preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/packs/new-pack-preview-is-pure.spec.ts)

##### Pack remove preview describes the removal without changing any state

- Requirement: `cli/packs/remove/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When packs remove runs in preview mode against a recorded member, it shall report the dependency it would remove with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any installed content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the membership use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/packs/add/records-member-as-pack-dependency`
- Source: [`packages/core/extension-authoring/src/packs/remove-from-pack-preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/packs/remove-from-pack-preview-is-pure.spec.ts)

##### Pack unpack preview describes the promotions without changing any state

- Requirement: `cli/packs/unpack/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When packs unpack runs in preview mode against an installed pack, it shall report the members it would promote to direct entries and the pack it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections; and when the named pack is not configured it shall report that and change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`packages/core/extension-lifecycle/src/packs/unpack-preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/packs/unpack-preview-is-pure.spec.ts)

##### A preview reads the same with or without advance approval and spends none of it

- Requirement: `cli/preview-does-not-consume-approval`
- Owner: `workspace-operations`
- Statement: When a command that offers both assessment and advance approval runs in preview mode, it shall render the same candidate whether or not approval accompanies the request, shall ask for no confirmation, and a later unattended apply without approval shall still stop as approval required with nothing changed.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Whether an approval is spent is decided by the execution resolution over one prepared candidate; no process or filesystem fact is involved.
- Methods: example
- Derived from: `cli/demote/preview-is-pure`
- Assumptions: That a real workspace plan carries the confirmable `replace-workspace-authority` risk is witnessed by cli/demote/preview-is-pure at the owning feature; this rule owns only what a preview does with such a risk and with the approval a request carries.
- Source: [`packages/core/workspace-operations/src/plan/preview-does-not-consume-approval.spec.ts`](../packages/core/workspace-operations/src/plan/preview-does-not-consume-approval.spec.ts)

##### Generated document currency follows authoritative inputs, not rendered bytes

- Requirement: `cli/projection-currency-follows-state-authority`
- Owner: `workspace-sync`
- Statement: Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged and regenerating when inputs change or the generated document is missing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Boundary rationale: Reconciliation is what judges currency; running it over a real workspace shows exactly which bytes it leaves alone and which it regenerates.
- Methods: decision-table, example
- Derived from: `packages/core/workspace-configuration/src/instructions/instruction-copy-currency.test.ts`
- Limitation: The supporting lint cross-check — that a rewritten managed body produces no `workspace/projection-ownership-valid` finding — is not exercised here: a reconciliation cannot import the lint feature, and lint cannot produce a validly generated document without running one. The reconciliation side of the same fact is exercised: the rewritten body is reported as nothing to reconcile. Retires when: `@agentxm/workspace-lint` gains a test that runs its ownership rule over a generated document whose body was rewritten and whose marker and generation record are intact.
- Limitation: The instruction-copy currency rows run beside the instruction-management use case that owns them, in `packages/core/workspace-configuration/src/instructions/instruction-copy-currency.test.ts`; a reconciliation cannot reach that feature. They establish copy currency on a host filesystem with symlink creation refused, not Windows permissions, native symlink probing, or Windows filesystem behavior; the dedicated Windows instruction suite supplies that evidence separately. Retires when: Retain the same instruction-copy currency observations through real symlink-unavailable environments on each supported platform, alongside separately attributable Windows execution.
- Additional evidence: process via [`apps/cli-e2e/src/projection-currency.e2e.test.ts`](../apps/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`packages/core/workspace-sync/src/projection-currency-follows-state-authority.spec.ts`](../packages/core/workspace-sync/src/projection-currency-follows-state-authority.spec.ts)

##### Publish preview reports the admitted publication set without distributing anything

- Requirement: `cli/publish/preview-is-pure`
- Owner: `extension-publish`
- Statement: When publish runs in preview mode, AXM shall report the admitted publication set or identify missing exact-publication authorization with a next action for the same selection, without creating authorization, uploading anything to the target registry, or changing settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure-and-gate-is-fixed`, `cli/publish/publication-gate-is-fixed`, `cli/hooks/publish/preview-is-pure`, `cli/knowledge/publish/preview-is-pure`, `cli/mcps/publish/preview-is-pure`, `cli/packs/publish/preview-is-pure`, `cli/rules/publish/preview-is-pure`, `cli/skills/publish/preview-is-pure`, `cli/subagents/publish/preview-is-pure`
- Supersedes: `cli/publish/preview-is-pure-and-gate-is-fixed`, `cli/hooks/publish/preview-is-pure`, `cli/knowledge/publish/preview-is-pure`, `cli/mcps/publish/preview-is-pure`, `cli/packs/publish/preview-is-pure`, `cli/rules/publish/preview-is-pure`, `cli/skills/publish/preview-is-pure`, `cli/subagents/publish/preview-is-pure`
- Assumptions: Which routes accept --preview and refuse --yes is command grammar, asserted over every route by cli/preview-uses-the-canonical-flag rather than per type here.
- Additional evidence: process via [`apps/cli-e2e/src/http-registry.e2e.test.ts`](../apps/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`packages/core/extension-publish/src/preview-is-pure.spec.ts`](../packages/core/extension-publish/src/preview-is-pure.spec.ts)

##### Rule creation preview describes the scaffold without creating any state

- Requirement: `cli/rules/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When rule creation is previewed for an owner the workspace authors, it shall report the manifest, body, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or the shared instruction surface; a previewed creation the workspace refuses shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/rules/new/creates-enabled-workspace-content`
- Source: [`packages/core/extension-authoring/src/rules/new/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/rules/new/preview-is-pure.spec.ts)

##### Setup preview describes the workspace it would create without creating it

- Requirement: `cli/setup/preview-is-pure`
- Owner: `workspace-configuration`
- Statement: When setup runs in preview mode, it shall report the workspace it would initialize with a previewed outcome and shall not create settings, the lockfile, the runtime directory, instruction files, or any agent output, whether or not preapproval accompanies the preview.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/setup/preview-resolves-inputs-without-prompts`
- Source: [`packages/core/workspace-configuration/src/setup/preview-is-pure.spec.ts`](../packages/core/workspace-configuration/src/setup/preview-is-pure.spec.ts)

##### Skill import preview describes the conversion without changing any state

- Requirement: `cli/skills/import/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When skills import runs in preview mode against a native skill, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the import use case: a preview stages the converted package into a temporary directory and returns before the workspace transaction opens, so a real project directory observes both that nothing under the workspace moved and that the native document is byte-identical.
- Methods: example
- Derived from: `apps/cli-e2e/src/fork-import.e2e.test.ts`
- Source: [`packages/core/extension-authoring/src/import/skills/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/import/skills/preview-is-pure.spec.ts)

##### Skill creation preview describes the scaffold without creating any state

- Requirement: `cli/skills/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When skill creation is previewed for an owner the workspace authors, it shall report the manifest, content, settings entry, and agent locations it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent projections; a previewed creation the workspace refuses shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/skills/new/scaffolds-for-every-configured-agent`
- Source: [`packages/core/extension-authoring/src/skills/new/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/skills/new/preview-is-pure.spec.ts)

##### Subagent import preview describes the conversion without changing any state

- Requirement: `cli/subagents/import/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When subagents import runs in preview mode against a native subagent, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the import use case: a preview stages the converted package into a temporary directory and returns before the workspace transaction opens, so a real project directory observes both that nothing under the workspace moved and that the native document is byte-identical.
- Methods: example
- Derived from: `cli/skills/import/preview-is-pure`, `apps/cli-e2e/src/fork-import.e2e.test.ts`
- Source: [`packages/core/extension-authoring/src/import/subagents/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/import/subagents/preview-is-pure.spec.ts)

##### Subagent creation preview describes the scaffold without creating any state

- Requirement: `cli/subagents/new/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When subagent creation is previewed for an owner the workspace authors, it shall report the manifest, content, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent projections; a previewed creation the workspace refuses shall likewise change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Derived from: `cli/subagents/new/scaffolds-for-every-configured-agent`
- Source: [`packages/core/extension-authoring/src/subagents/new/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/subagents/new/preview-is-pure.spec.ts)

##### Sync preview describes required changes without applying them

- Requirement: `cli/sync/preview-is-pure`
- Owner: `workspace-sync`
- Statement: When sync runs in preview mode against a workspace whose managed state has drifted from desired state, it shall report the reconciliation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/realizes-desired-state`
- Source: [`packages/core/workspace-sync/src/preview-is-pure.spec.ts`](../packages/core/workspace-sync/src/preview-is-pure.spec.ts)

##### Sync realizes desired additions and removes what desired state no longer includes

- Requirement: `cli/sync/realizes-desired-state`
- Owner: `workspace-sync`
- Statement: Sync shall realize each desired extension AXM owns, recording a first accepted resolution for one that has none and restoring missing agent projections from canonical content and missing canonical content from the exact accepted identity, shall remove owned outputs that desired state no longer includes, and shall report a no-op once managed state agrees with desired state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/preserves-configuration-and-resolutions`
- Source: [`packages/core/workspace-sync/src/realizes-desired-state.spec.ts`](../packages/core/workspace-sync/src/realizes-desired-state.spec.ts)

##### Deprecation removal uses the observed revision

- Requirement: `cli/undeprecate/removes-guidance-at-the-observed-revision`
- Owner: `extension-publish`
- Statement: The undeprecate command shall read the selected extension's deprecation revision, use that exact revision as the removal precondition, and report the Registry's acknowledged transition without silently replacing a rejected precondition.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/lifecycle/command.ts`, `apps/cli/src/root/lifecycle/command.test.ts`
- Source: [`packages/core/extension-publish/src/deprecation/removes-guidance-at-the-observed-revision.spec.ts`](../packages/core/extension-publish/src/deprecation/removes-guidance-at-the-observed-revision.spec.ts)

##### Uninstalling an extension the workspace does not desire is a safe no-op

- Requirement: `cli/uninstall/is-idempotent`
- Owner: `extension-lifecycle`
- Statement: When uninstall targets an extension the workspace does not desire, whether never installed, already uninstalled, or an inline MCP server whose removal is repeated, it shall report a no-op and shall change no configuration, resolution, canonical content, or agent projection.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`
- Additional evidence: process via [`apps/cli-e2e/src/root-uninstall.e2e.test.ts`](../apps/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/uninstall/is-idempotent.spec.ts`](../packages/core/extension-lifecycle/src/uninstall/is-idempotent.spec.ts)

##### Uninstall preserves unrelated and unowned files

- Requirement: `cli/uninstall/preserves-unrelated-and-unowned-state`
- Owner: `extension-lifecycle`
- Statement: When an extension is uninstalled, AXM shall preserve unrelated workspace files, unowned agent configuration, and the original local or workspace-authored source package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`, `cli/mcps/uninstall/preserves-unowned-native-entries`
- Supersedes: `cli/every-type-completes-the-shared-lifecycle`, `cli/mcps/uninstall/preserves-unowned-native-entries`
- Additional evidence: process via [`apps/cli-e2e/src/command.e2e.test.ts`](../apps/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/uninstall/preserves-unrelated-and-unowned-state.spec.ts`](../packages/core/extension-lifecycle/src/uninstall/preserves-unrelated-and-unowned-state.spec.ts)

##### Uninstall preview describes the removal without changing any state

- Requirement: `cli/uninstall/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When an uninstall of any extension type runs in preview mode, it shall not change settings, the lockfile, canonical content, or agent projections; when the request names a desired extension and passes the applicable checks, it shall report the removal it would apply with a previewed outcome; and when it names a target the workspace does not desire, it shall withdraw nothing and still change nothing, settling as a no-op with no unit for a skill, subagent, rule, hooks package, Knowledge bundle, or Pack and as a previewed unit that declares no removal for an MCP server.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/uninstall/is-idempotent`, `cli/hooks/uninstall/preview-is-pure`, `cli/knowledge/uninstall/preview-is-pure`, `cli/mcps/uninstall/preview-is-pure`, `cli/packs/uninstall/preview-is-pure`, `cli/rules/uninstall/preview-is-pure`, `cli/skills/uninstall/preview-is-pure`, `cli/subagents/uninstall/preview-is-pure`
- Supersedes: `cli/hooks/uninstall/preview-is-pure`, `cli/knowledge/uninstall/preview-is-pure`, `cli/mcps/uninstall/preview-is-pure`, `cli/packs/uninstall/preview-is-pure`, `cli/rules/uninstall/preview-is-pure`, `cli/skills/uninstall/preview-is-pure`, `cli/subagents/uninstall/preview-is-pure`
- Open questions: Whether previewing the removal of a target the workspace does not desire should settle as a no-op for every type, rather than as a previewed unit for an MCP server, is undecided; the example table records the split as it stands.
- Limitation: The MCP-server row witnesses only that previewing the removal of a server the workspace does not desire writes nothing and declares no removal. It cannot witness that the preview reports the target as absent: the settled candidate carries no absent-versus-desired distinction into the resolution, and the per-agent outcomes that would carry it are attached by the surface that renders the plan, not by this package. Retires when: The settled uninstall candidate carries the absent-versus-desired distinction into the resolution for every type, so the row can assert the report as well as the purity.
- Source: [`packages/core/extension-lifecycle/src/uninstall/preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/uninstall/preview-is-pure.spec.ts)

##### Unyank restores only the explicitly identified version

- Requirement: `cli/unyank/requires-an-exact-version`
- Owner: `extension-publish`
- Statement: The unyank command shall require an exact semantic version, request restoration only for that version, and report restoration only after the Registry acknowledges the request.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/lifecycle/command.ts`, `apps/cli/src/root/lifecycle/command.test.ts`
- Source: [`packages/core/extension-publish/src/yank/unyank-requires-an-exact-version.spec.ts`](../packages/core/extension-publish/src/yank/unyank-requires-an-exact-version.spec.ts)

##### Update preview describes the advance without changing any state

- Requirement: `cli/update/preview-is-pure`
- Owner: `extension-lifecycle`
- Statement: When update runs in preview mode against a configured extension of any type whose source offers a newer version the recorded intent allows, it shall report the advance it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections; when the selection names nothing the workspace has configured, it shall report that and change nothing; and when the source cannot supply the advance, it shall report the problem and still change nothing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/update/advances-resolution-within-intent`, `cli/hooks/update/preview-is-pure`, `cli/knowledge/update/preview-is-pure`, `cli/mcps/update/preview-is-pure`, `cli/packs/update/preview-is-pure`, `cli/rules/update/preview-is-pure`, `cli/skills/update/preview-is-pure`, `cli/subagents/update/preview-is-pure`
- Supersedes: `cli/hooks/update/preview-is-pure`, `cli/knowledge/update/preview-is-pure`, `cli/mcps/update/preview-is-pure`, `cli/packs/update/preview-is-pure`, `cli/rules/update/preview-is-pure`, `cli/skills/update/preview-is-pure`, `cli/subagents/update/preview-is-pure`
- Source: [`packages/core/extension-lifecycle/src/update/preview-is-pure.spec.ts`](../packages/core/extension-lifecycle/src/update/preview-is-pure.spec.ts)

##### Upgrade preserves current and newer installations unless equal-version reinstall is requested

- Requirement: `cli/upgrade/preserves-current-or-newer-installations`
- Owner: `cli-update`
- Statement: AXM shall leave an equal or newer installation unchanged unless equal-version reinstallation is explicitly requested, and shall refuse a downgrade even when reinstallation is requested.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/cli-update/src/upgrade/preserves-current-or-newer-installations.spec.ts`](../packages/core/cli-update/src/upgrade/preserves-current-or-newer-installations.spec.ts)

##### Upgrade preview resolves the installation change without performing it

- Requirement: `cli/upgrade/preview-is-pure`
- Owner: `cli-update`
- Statement: When upgrade runs in preview mode against an installation with a newer promoted release, it shall report the installer, the target, and the command it would run with a previewed outcome and shall invoke no installer command, persist no install metadata, and write no update-check cache.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/discloses-resolved-ownership-before-mutation`
- Source: [`packages/core/cli-update/src/upgrade/preview-is-pure.spec.ts`](../packages/core/cli-update/src/upgrade/preview-is-pure.spec.ts)

##### Version preview describes the manifest bump without changing any state

- Requirement: `cli/version/preview-is-pure`
- Owner: `extension-authoring`
- Statement: When version runs in preview mode against a workspace-authored extension, it shall report the version it would record with a previewed outcome and shall not change the manifest, settings, the lockfile, or any other authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Boundary rationale: Purity is a property of the version use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.
- Methods: example
- Source: [`packages/core/extension-authoring/src/version/preview-is-pure.spec.ts`](../packages/core/extension-authoring/src/version/preview-is-pure.spec.ts)

##### Explicit visibility changes carry operator intent and the observed revision

- Requirement: `cli/visibility/set/uses-explicit-intent-and-observed-revision`
- Owner: `extension-publish`
- Statement: The visibility set command shall require established Registry visibility, submit the requested value as operator intent conditional on the observed revision, and report the acknowledged change without silently replacing a rejected precondition.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/visibility/handler.ts`, `AgentXM Registry API 0.1.0`
- Source: [`packages/core/extension-publish/src/visibility/set-uses-explicit-intent-and-observed-revision.spec.ts`](../packages/core/extension-publish/src/visibility/set-uses-explicit-intent-and-observed-revision.spec.ts)

##### Yank submits the explicit version selection and publisher guidance

- Requirement: `cli/yank/submits-the-requested-version-selection`
- Owner: `extension-publish`
- Statement: The yank command shall require an exact version unless all available versions are explicitly selected, submit only that selection with the supplied category and notice, and report the acknowledged selection without claiming that future versions were yanked.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/lifecycle/command.ts`, `apps/cli/src/root/lifecycle/command.test.ts`
- Source: [`packages/core/extension-publish/src/yank/submits-the-requested-version-selection.spec.ts`](../packages/core/extension-publish/src/yank/submits-the-requested-version-selection.spec.ts)

### Goal: trustworthy-distribution

Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.

#### Functional

##### Install records the accepted resolution in the lockfile

- Requirement: `cli/install/records-accepted-resolution`
- Owner: `extension-lifecycle`
- Statement: When a person installs an acquirable extension, the install shall record the extension's accepted resolution, including its source and content identity, in the workspace lockfile.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/install/records-accepted-resolution.spec.ts`](../packages/core/extension-lifecycle/src/install/records-accepted-resolution.spec.ts)

##### Publication uses the explicitly selected Registry

- Requirement: `cli/publication-uses-explicit-registry-target`
- Owner: `extension-publish`
- Statement: When exactly one Registry target is supplied for publication — a configured Registry by name, or an explicit Registry URL — AXM shall direct the admitted publication to that Registry and refuse a target it cannot resolve without publishing anywhere.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: The publish use case resolves the target against the workspace's configured sources; two real file Registries show the admitted publication landing at the selected destination and the other staying empty.
- Methods: decision-table, example
- Derived from: `apps/cli/src/root/publish/command.ts`, `apps/cli/src/root/publish/per-type-command.ts`
- Open questions: What target or rejection is required when both a configured name and an explicit URL are supplied? The current implementation prefers the URL and retains the supplied name as a label; no public precedence promise was identified.; Which Registry should a publication without either target select? The current implementation takes the first resolved Registry source; this requirement does not establish that default or source-order policy.; Which URL schemes are supported publication targets beyond the existing local Registry and HTTP implementations? No new scheme support or normalization guarantee is established here.
- Limitation: The examples use local file Registry destinations. HTTP publication capability binding and credential-origin isolation remain separately owned; no live Registry, remote authentication, or server-side storage behavior is established here. Retires when: Retain explicit target selection evidence through each supported target transport without duplicating the credential and publication-capability owners.
- Source: [`packages/core/extension-publish/src/target/publication-uses-explicit-registry-target.spec.ts`](../packages/core/extension-publish/src/target/publication-uses-explicit-registry-target.spec.ts)

##### Publication refuses incomplete or unsafe archives

- Requirement: `cli/publish/archives-satisfy-distribution-contract`
- Owner: `extension-publish`
- Statement: Before uploading an extension, publish shall reject an archive that omits a required package file or includes a node_modules entry or .env file, identify the invalid path, and give removal guidance for unsafe entries.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `apps/cli/src/root/publish/command.ts`
- Source: [`packages/core/extension-publish/src/archive/archives-satisfy-distribution-contract.spec.ts`](../packages/core/extension-publish/src/archive/archives-satisfy-distribution-contract.spec.ts)

##### Existing publications are verified or rejected without being overwritten

- Requirement: `cli/publish/existing-versions-require-explicit-policy`
- Owner: `extension-publish`
- Statement: For an already published version, publish shall reject the error policy, treat the verify policy as a successful no-op only when the newly built archive's SHA-512 integrity matches the published integrity, and reject differing content as integrity drift, with an explicit single selector defaulting to error and bulk selection defaulting to verify.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/publish.md`, `apps/cli/src/root/publish/command.test.ts`
- Source: [`packages/core/extension-publish/src/preflight/existing-versions-require-explicit-policy.spec.ts`](../packages/core/extension-publish/src/preflight/existing-versions-require-explicit-policy.spec.ts)

##### Publication exclusions use explicit case-sensitive package paths

- Requirement: `cli/publish/ignore-patterns-have-declared-path-semantics`
- Owner: `extension-publish`
- Statement: Publish shall match ignore patterns against case-sensitive archive-relative POSIX paths with only the asterisk acting as a wildcard across directory separators and with question marks, brackets, and negation characters treated literally.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/publish.md`
- Source: [`packages/core/extension-publish/src/archive/ignore-patterns-have-declared-path-semantics.spec.ts`](../packages/core/extension-publish/src/archive/ignore-patterns-have-declared-path-semantics.spec.ts)

##### Older unpublished versions require explicit backfill

- Requirement: `cli/publish/older-unpublished-versions-require-backfill`
- Owner: `extension-publish`
- Statement: Publish shall reject an unpublished version below the highest published semantic version unless backfill is explicitly requested, and the refusal shall offer a version bump or intentional backfill, and backfill shall permit only an unpublished version without authorizing replacement of an existing release.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/publish/command.ts`, `apps/cli/src/root/publish/command.test.ts`
- Source: [`packages/core/extension-publish/src/preflight/older-unpublished-versions-require-backfill.spec.ts`](../packages/core/extension-publish/src/preflight/older-unpublished-versions-require-backfill.spec.ts)

##### Publication results distinguish confirmed, failed, blocked, pending and unresolved work

- Requirement: `cli/publish/outcomes-distinguish-unresolved-uploads`
- Owner: `extension-publish`
- Statement: When publication does not confirm every selected candidate — failing in part or entirely, or being interrupted — AXM shall report each candidate according to the available evidence, retain acknowledged independent successes, block dependents of failed uploads, distinguish unattempted work from dispatched uploads with unknown outcomes, never resolve a run that confirms no publication as a success, and provide credential-free recovery for the unfinished selection.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `machine-automation`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `packages/core/extension-publish/src/settlement.test.ts`
- Limitation: How the unresolved run reads to a person — the rendered lines that name each candidate's unknown settlement and never say a publication happened — and the exit status that run leaves are the application's mapping of this outcome, not the outcome itself, so they are not observed here. Retires when: The CLI owns evidence, beside its publish view and exit mapping, that an unsettled run renders every unresolved candidate without reporting a publication and exits with the reported-problems code.
- Source: [`packages/core/extension-publish/src/settlement/outcomes-distinguish-unresolved-uploads.spec.ts`](../packages/core/extension-publish/src/settlement/outcomes-distinguish-unresolved-uploads.spec.ts)

##### One failed publish preflight blocks the whole selection

- Requirement: `cli/publish/preflight-blocks-the-whole-selection`
- Owner: `extension-publish`
- Statement: When any selected extension fails publish preflight, publish shall upload nothing for the selection and shall report every other publishable extension as blocked by preflight, naming the extension that failed.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; the source-state scenario substitutes the comparison outcome rather than running Git.
- Source: [`packages/core/extension-publish/src/preflight/preflight-blocks-the-whole-selection.spec.ts`](../packages/core/extension-publish/src/preflight/preflight-blocks-the-whole-selection.spec.ts)

##### Publishing preserves established extension visibility

- Requirement: `cli/publish/preserves-established-visibility`
- Owner: `extension-publish`
- Statement: Publish shall apply an explicit visibility request only when establishing a new extension, preserve existing extension visibility when adding or verifying a version, and report which visibility was established or preserved.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `apps/cli/src/root/publish/command.ts`
- Source: [`packages/core/extension-publish/src/visibility/preserves-established-visibility.spec.ts`](../packages/core/extension-publish/src/visibility/preserves-established-visibility.spec.ts)

##### The publication gate is fixed and ignores locally relaxed lint rules

- Requirement: `cli/publish/publication-gate-is-fixed`
- Owner: `extension-publish`
- Statement: When a selected extension violates the fixed publication gate, publish shall block it in preview and apply alike, shall name the violated rule, and shall upload nothing, regardless of any lint rule relaxed in axm.json.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Supersedes: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Source: [`packages/core/extension-publish/src/lint-gate/publication-gate-is-fixed.spec.ts`](../packages/core/extension-publish/src/lint-gate/publication-gate-is-fixed.spec.ts)

##### Publication reports differing workspace and consumer versions

- Requirement: `cli/publish/reports-pack-resolution-differences`
- Owner: `extension-publish`
- Statement: When an admitted authored pack has a dependency whose effective Registry version differs from the satisfying version in this workspace, publish shall report both versions and the dependency constraint as a warning with guidance for reconciling the difference, without treating that warning as a publication failure.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `apps/cli/src/root/publish/command.ts`
- Source: [`packages/core/extension-publish/src/preflight/reports-pack-resolution-differences.spec.ts`](../packages/core/extension-publish/src/preflight/reports-pack-resolution-differences.spec.ts)

##### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Owner: `extension-publish`
- Statement: Publish shall distribute only extensions the workspace authors: an explicitly selected acquired extension shall fail with a conflict that suggests adopting it and upload nothing, while bulk publication shall report acquired entries as not authored and may publish eligible authored entries without uploading acquired entries.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`packages/core/extension-publish/src/selection/requires-established-authorship.spec.ts`](../packages/core/extension-publish/src/selection/requires-established-authorship.spec.ts)

##### Publication requires an existing owner

- Requirement: `cli/publish/requires-existing-publish-owners`
- Owner: `extension-publish`
- Statement: Before remotely publishing a selected extension, AXM shall require its owner to exist and, when an owner is absent, reject publication without uploading and provide the organization creation route.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `apps/cli/src/root/publish/command.ts`
- Source: [`packages/core/extension-publish/src/preflight/requires-existing-publish-owners.spec.ts`](../packages/core/extension-publish/src/preflight/requires-existing-publish-owners.spec.ts)

##### Publish requires explicit acceptance when archive content differs from Git HEAD

- Requirement: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Owner: `extension-publish`
- Statement: When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall block that extension and name --accept-warnings as the required override until it is given, while an archive matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance; and each outcome shall report the comparison basis, its status, the HEAD revision when one exists, and the material differences and their count, while an outcome for an extension outside Git shall carry no source-state report.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, example, contract
- Derived from: `cli/publish/outcomes-report-source-state`
- Supersedes: `cli/publish/outcomes-report-source-state`
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; every scenario substitutes the comparison outcome rather than running Git.
- Additional evidence: process via [`apps/cli-e2e/src/skills.e2e.test.ts`](../apps/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`packages/core/extension-publish/src/source-state/requires-explicit-acceptance-for-non-head-source.spec.ts`](../packages/core/extension-publish/src/source-state/requires-explicit-acceptance-for-non-head-source.spec.ts)

##### Publication respects workspace pack constraints

- Requirement: `cli/publish/respects-local-pack-constraints`
- Owner: `extension-publish`
- Statement: When an authored member selected for publication is excluded by a workspace-authored pack constraint, publish shall reject it in preview and apply, including existing-version verification, name the member and the conflicting pack constraint, and offer the repair that edits that pack's constraint.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/publish/command.test.ts`, `apps/cli/src/root/publish/command.ts`
- Limitation: A member constrained by an acquired pack, whose authority is the Registry rather than this workspace, is not exercised; the statement was narrowed to the authored-pack repair the examples establish. Retires when: A row selects a member constrained by an acquired pack, states the repair that refusal offers, and the statement is widened back to every pack authority.
- Source: [`packages/core/extension-publish/src/preflight/respects-local-pack-constraints.spec.ts`](../packages/core/extension-publish/src/preflight/respects-local-pack-constraints.spec.ts)

##### Accepting a Registry extension from a different publisher needs a person's approval

- Requirement: `cli/publisher-changes-require-interactive-approval`
- Owner: `extension-lifecycle`
- Statement: When an apply would replace an accepted Registry binding with one published under a different publisher for the same extension, every route that can make that acceptance shall report the change in preview without changing anything, shall stop as approval required naming interactive approval when no prompt can open, and shall record the new binding only after a person approves it at a prompt; an acceptance under the same publisher, or a first acceptance, shall not be treated as such a change.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/update/preview-is-pure`, `cli/install/preview-is-pure`, `cli/skills/update/preview-is-pure`
- Source: [`packages/core/extension-lifecycle/src/publisher-changes-require-interactive-approval.spec.ts`](../packages/core/extension-lifecycle/src/publisher-changes-require-interactive-approval.spec.ts)

##### Upgrade discloses the installer it resolved and the version it selected before mutating

- Requirement: `cli/upgrade/discloses-resolved-ownership-before-mutation`
- Owner: `cli-update`
- Statement: Upgrade shall disclose the install method it detected and the version it selected before it performs the first mutation, and shall disclose both without performing any mutation when asked for a preview.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/ownership-precedes-release-selection`
- Source: [`packages/core/cli-update/src/upgrade/discloses-resolved-ownership-before-mutation.spec.ts`](../packages/core/cli-update/src/upgrade/discloses-resolved-ownership-before-mutation.spec.ts)

##### Exact upgrade bypasses release discovery

- Requirement: `cli/upgrade/exact-version-bypasses-discovery`
- Owner: `cli-update`
- Statement: An upgrade naming a normalized stable semantic version shall derive its immutable GitHub Release coordinate without discovery, and shall reject leading-v, prerelease, or non-normalized versions before mutation.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Source: [`packages/core/cli-update/src/version-resolution/exact-version-bypasses-discovery.spec.ts`](../packages/core/cli-update/src/version-resolution/exact-version-bypasses-discovery.spec.ts)

##### Homebrew checks selected-version availability once

- Requirement: `cli/upgrade/homebrew-checks-availability-once`
- Owner: `cli-update`
- Statement: When a Homebrew-owned installation requires mutation, upgrade shall perform at most one explicit metadata refresh and one formula query, then either proceed on an exact match or stop without polling for publication.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/installer-availability-gates-mutation`
- Source: [`packages/core/cli-update/src/upgrade/homebrew-checks-availability-once.spec.ts`](../packages/core/cli-update/src/upgrade/homebrew-checks-availability-once.spec.ts)

##### Latest upgrade uses the promoted stable channel

- Requirement: `cli/upgrade/latest-uses-promoted-stable-channel`
- Owner: `cli-update`
- Statement: An upgrade without an exact version shall select only the validated release coordinate in the fixed public stable-channel document using one bounded request, and shall not enumerate GitHub releases or infer stability from package-manager publication state.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/cli-update/src/version-resolution/latest-uses-promoted-stable-channel.spec.ts`](../packages/core/cli-update/src/version-resolution/latest-uses-promoted-stable-channel.spec.ts)

##### Unsupported upgrade routes require explicit recovery

- Requirement: `cli/upgrade/requires-a-supported-upgrade-route`
- Owner: `cli-update`
- Statement: When an installation is owned by a manager that AXM cannot use for in-place upgrade, AXM shall leave that installation unchanged and report an explicit recovery route without silently delegating to another manager.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/cli-update/src/upgrade/requires-a-supported-upgrade-route.spec.ts`](../packages/core/cli-update/src/upgrade/requires-a-supported-upgrade-route.spec.ts)

##### Script upgrade restores the original after replacement fails verification

- Requirement: `cli/upgrade/restores-original-after-failed-replacement`
- Owner: `cli-update`
- Statement: When a script-owned executable has been replaced but cannot be verified as the selected version, or the operation is interrupted before completion, AXM shall restore the original executable and shall not report a successful upgrade.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Assumptions: Filesystem restoration remains available; operating-system or storage failures that also prevent rollback require separate recovery evidence.
- Limitation: Restoration after an externally terminated replacement is witnessed in process, through the finalizer the interrupt runs, rather than at the process boundary: the release channel and asset URLs are compiled constants with no environment override, so no installed-boundary run can serve a release fixture to the built executable. Retires when: The self-update capability accepts a release-origin override that a controlled run may point at a local fixture, and an installed-boundary example signals the running upgrade and observes the restored executable and exit status.
- Source: [`packages/core/cli-update/src/upgrade/restores-original-after-failed-replacement.spec.ts`](../packages/core/cli-update/src/upgrade/restores-original-after-failed-replacement.spec.ts)

##### Script upgrade verifies a download before replacing the installed executable

- Requirement: `cli/upgrade/verifies-download-before-replacement`
- Owner: `cli-update`
- Statement: For a script-owned installation, AXM shall preserve the installed executable unless the selected download has exactly one valid matching checksum and reports the selected version.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Assumptions: The controlled process port reports executable versions; native binary viability is established by installed-boundary evidence.
- Source: [`packages/core/cli-update/src/upgrade/verifies-download-before-replacement.spec.ts`](../packages/core/cli-update/src/upgrade/verifies-download-before-replacement.spec.ts)

##### Package-manager upgrade success requires observed installation evidence

- Requirement: `cli/upgrade/verifies-package-manager-upgrades`
- Owner: `cli-update`
- Statement: When an owning package manager performs an upgrade, AXM shall delegate the selected version to that owner and report success only after the owning installation and the executable selected by command lookup report that version, distinguishing failed commands, unchanged versions and unavailable verification.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Open questions: The automatic Homebrew reinstall used after a successful but unchanged upgrade remains subordinate recovery logic; its exact retry policy is not an independently accepted experience obligation.
- Source: [`packages/core/cli-update/src/upgrade/verifies-package-manager-upgrades.spec.ts`](../packages/core/cli-update/src/upgrade/verifies-package-manager-upgrades.spec.ts)

#### Constraints

##### Installer availability gates upgrade mutation

- Requirement: `cli/upgrade/installer-availability-gates-mutation`
- Owner: `cli-update`
- Statement: Before mutating an npm-, pnpm-, Yarn-, or Homebrew-owned installation, upgrade shall establish that the selected exact version is available through that installer; lagging, leading, unavailable, or indeterminate publication state shall leave the installation unchanged and report recovery guidance.
- Class: constraint
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/cli-update/src/upgrade/installer-availability-gates-mutation.spec.ts`](../packages/core/cli-update/src/upgrade/installer-availability-gates-mutation.spec.ts)

### Goal: workspace-intent-fidelity

Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.

#### Functional

##### Activation commands change realized surfaces without touching content or resolutions

- Requirement: `cli/activation-follows-desired-state`
- Owner: `extension-lifecycle`
- Statement: When an installed extension is disabled or enabled, the workspace shall record the new activation intent and change only that extension's realized agent surfaces, and shall not alter canonical content or accepted resolutions; re-enabling a Skill shall restore its entry document byte for byte for every agent surface, whichever entry-document format the Skill was authored in.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`apps/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../apps/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Source: [`packages/core/extension-lifecycle/src/activation/activation-follows-desired-state.spec.ts`](../packages/core/extension-lifecycle/src/activation/activation-follows-desired-state.spec.ts)

##### The agent option configures workspace membership or filters a listing

- Requirement: `cli/agent-selection-is-membership-or-filter`
- Owner: `cli`
- Statement: A command shall accept the agent option only to choose the workspace's configured agents or to filter a listing, shall reject an unsupported identifier supplied through that option before any work begins, and shall not use that option to narrow the agents for one extension.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `axm setup --agent`, `axm skills list --agent`, `axm subagents list --agent`, `cli/sync/realizes-desired-state`, `cli/agents/membership-changes-realize-affected-outputs`
- Assumptions: The agent catalog shipped with the CLI is the only source of supported agent identifiers, so an identifier outside it can be refused without consulting the workspace.
- Source: [`apps/cli/src/cli-flags/agent-selection-is-membership-or-filter.spec.ts`](../apps/cli/src/cli-flags/agent-selection-is-membership-or-filter.spec.ts)

##### Agent inventory distinguishes configuration from detection

- Requirement: `cli/agents/list/reports-configured-detected-and-available-agents`
- Owner: `workspace-configuration`
- Statement: When a person lists coding agents, AXM shall distinguish configured membership from detected installations, identify their catalog lifecycle, show their union by default, and restrict the results to detected agents or include every configurable agent when the respective selection is requested.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-configuration/src/membership/configure-agents.ts`
- Open questions: The combination of --detected and --available has no separately established user-facing meaning; precedence is not specified here.
- Source: [`packages/core/workspace-configuration/src/membership/reports-configured-detected-and-available-agents.spec.ts`](../packages/core/workspace-configuration/src/membership/reports-configured-detected-and-available-agents.spec.ts)

##### Removing a coding agent never removes agent-native content without AXM ownership proof

- Requirement: `cli/agents/remove/preserves-unowned-agent-content`
- Owner: `cli`
- Statement: When a coding agent is removed from the workspace, AXM shall remove only agent-native content it can prove it owns and shall leave hand-authored content in the same agent directory untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Boundary rationale: Ownership is proven by what a real agent directory entry is — a link into a canonical root, or a hand-authored file that is neither — so the evidence is the directory itself before and after the removal.
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`apps/cli-e2e/src/agent-membership.e2e.test.ts`](../apps/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`apps/cli/src/root/agents/preserves-unowned-agent-content.spec.ts`](../apps/cli/src/root/agents/preserves-unowned-agent-content.spec.ts)

##### Commands use the selected working directory

- Requirement: `cli/commands-use-selected-directory`
- Owner: `cli-e2e`
- Statement: AXM shall execute workspace commands in the directory selected by --directory or -C, including when that selection is a symbolic link, and shall use the launch directory when no directory is selected.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `apps/cli-e2e/src/directory.e2e.test.ts`, `apps/cli/help/topics/basic-usage.md`
- Open questions: Should repeated or empty directory options be rejected or have an explicit selection policy?
- Source: [`apps/cli-e2e/src/commands-use-selected-directory.spec.ts`](../apps/cli-e2e/src/commands-use-selected-directory.spec.ts)

##### Advance approval is offered only where it settles one documented decision

- Requirement: `cli/confirmation-flags-have-a-supported-purpose`
- Owner: `cli`
- Statement: A command shall accept the advance-approval flag only when it documents the one confirmation that flag settles, an invocation carrying the flag shall change that command's outcome exactly as documented, and every other command shall reject the flag and its short spelling before any work begins.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `cli/demote/preview-is-pure`, `cli/setup/unattended-apply-requires-explicit-intent`, `cli/login/preapproval-requests-new-sign-in`
- Source: [`apps/cli/src/root/shared/confirmation-flags-have-a-supported-purpose.spec.ts`](../apps/cli/src/root/shared/confirmation-flags-have-a-supported-purpose.spec.ts)

##### A person is asked to confirm only when the plan carries a risk worth confirming

- Requirement: `cli/confirmation-is-required-only-for-actionable-risk`
- Owner: `workspace-operations`
- Statement: An apply whose plan carries no confirmable risk shall proceed without asking, an apply with nothing to do shall finish without asking, and an apply whose plan carries a confirmable risk shall ask when a prompt can open, honor a declined answer by changing nothing, and stop as approval required when no prompt can open.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Boundary rationale: Whether a confirmation opens is decided by the execution resolution over a prepared candidate's risk conditions; no process or filesystem fact is involved.
- Methods: example
- Derived from: `cli/machine-mode-never-prompts`, `cli/preview-does-not-consume-approval`
- Assumptions: That a real plan carries the confirmable `replace-workspace-authority` risk is witnessed by cli/demote/preview-is-pure at the owning feature; this specification owns only what the resolution does with such a risk.
- Source: [`packages/core/workspace-operations/src/plan/confirmation-is-required-only-for-actionable-risk.spec.ts`](../packages/core/workspace-operations/src/plan/confirmation-is-required-only-for-actionable-risk.spec.ts)

##### Credentials stay within their Registry origin

- Requirement: `cli/credentials-stay-with-their-registry`
- Owner: `registry-auth`
- Statement: When authenticating a Registry request, AXM shall use ambient tokens only for the configured Registry origin and otherwise use credentials saved for the request origin or send no credential.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/supporting/registry-auth/src/token-resolution.ts`
- Source: [`packages/supporting/registry-auth/src/credentials-stay-with-their-registry.spec.ts`](../packages/supporting/registry-auth/src/credentials-stay-with-their-registry.spec.ts)

##### Override flags bypass only the one policy they name

- Requirement: `cli/force-bypasses-only-named-policies`
- Owner: `cli`
- Statement: No command shall expose a bare --force flag; every override flag a command exposes shall name in its help text the one policy it bypasses, and a request carrying that flag shall bypass that policy while remaining subject to every other policy.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Source: [`apps/cli/src/cli-flags/force-bypasses-only-named-policies.spec.ts`](../apps/cli/src/cli-flags/force-bypasses-only-named-policies.spec.ts)

##### An unchanged install request applies the plan shown in its preview

- Requirement: `cli/install/apply-realizes-the-previewed-closure`
- Owner: `extension-lifecycle`
- Statement: When an install preview is followed by an apply of the same request against an unchanged workspace, the install shall realize exactly the closure the preview described, committing the same plan candidate and the same units, and the described extension shall be present in the workspace afterwards.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Open questions: The install preview lists the closure's units and plan candidate but no artifact paths or target surfaces, while the apply lists both; whether a preview should describe target surfaces, as skill and subagent creation do, is unresolved, so this specification requires agreement on the plan candidate and unit set only.
- Source: [`packages/core/extension-lifecycle/src/install/apply-realizes-the-previewed-closure.spec.ts`](../packages/core/extension-lifecycle/src/install/apply-realizes-the-previewed-closure.spec.ts)

##### Workspace install skips inline MCP configuration without failing

- Requirement: `cli/install/inline-mcp-configuration-is-skipped`
- Owner: `extension-lifecycle`
- Statement: When the workspace's configured extensions are installed and workspace settings configure an MCP server inline, the install shall report that entry as a skipped unit carrying guidance, shall complete without failure, shall not record the entry in the lockfile, and shall leave the inline configuration unchanged.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/inline-mcp-configuration-not-acquirable`
- Supersedes: `cli/install/inline-mcp-configuration-not-acquirable`
- Open questions: The resolution names the entry's state (skipped) but carries the reason only as prose in the unit's message; no structured field says the entry is inline workspace configuration that sync reconciles. Until the resolution contract names that reason, this specification asserts the skipped state and the presence of guidance and leaves the message wording non-normative.
- Source: [`packages/core/extension-lifecycle/src/install/inline-mcp-configuration-is-skipped.spec.ts`](../packages/core/extension-lifecycle/src/install/inline-mcp-configuration-is-skipped.spec.ts)

##### Install rejects a source it cannot install without changing the workspace

- Requirement: `cli/install/non-installable-sources-do-not-mutate`
- Owner: `extension-lifecycle`
- Statement: When the install source is a bare name or names an unknown extension type, the install shall fail with usage guidance or a not-found outcome and shall not change settings, the lockfile, or workspace content.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property
- Open questions: Whether an unknown extension type in a registry name fails as usage guidance or as not found is undecided; the scenario accepts either outcome.
- Source: [`packages/core/extension-lifecycle/src/install/non-installable-sources-do-not-mutate.spec.ts`](../packages/core/extension-lifecycle/src/install/non-installable-sources-do-not-mutate.spec.ts)

##### Install leaves unrelated configuration and unowned content untouched

- Requirement: `cli/install/preserves-unrelated-and-unowned-state`
- Owner: `extension-lifecycle`
- Statement: When an extension is installed, the install shall leave hand-authored content in agent directories and unrelated project files byte-for-byte intact and shall preserve every unrelated setting while adding the new declaration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/extension-lifecycle/src/install/preserves-unrelated-and-unowned-state.spec.ts`](../packages/core/extension-lifecycle/src/install/preserves-unrelated-and-unowned-state.spec.ts)

##### Install records the extension as directly desired workspace configuration

- Requirement: `cli/install/records-direct-intent`
- Owner: `extension-lifecycle`
- Statement: When a person installs an acquirable extension, the install shall record it in workspace settings as directly desired configuration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`apps/cli-e2e/src/root-install.e2e.test.ts`](../apps/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/install/records-direct-intent.spec.ts`](../packages/core/extension-lifecycle/src/install/records-direct-intent.spec.ts)

##### Installed extensions, coding agents, and instruction files stay in the selected scope

- Requirement: `cli/installed-state-stays-in-selected-scope`
- Owner: `cli-e2e`
- Statement: Installed-extension operations, coding-agent listing and membership changes, and instruction-file inspection, enablement, and disablement shall use the selected project or user workspace and its native files for workspace results and changes, default to project scope when no workspace scope is selected, name only selected-scope native files in any permission guidance they emit, and preserve the other scope's workspace and native files.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: process; selection: per-change
- Boundary rationale: Separate built CLI invocations establish explicit and default workspace scope through the registered commands, observe persisted extension state, agent membership, and instruction-file settings, and read actual project-versus-home native output content.
- Methods: decision-table, example
- Derived from: `apps/cli/src/root/scope-contract.ts`, `apps/cli/src/root/agents/list.ts`, `apps/cli/src/root/agents/add.ts`, `apps/cli/src/root/agents/remove.ts`, `apps/cli/src/root/instructions.ts`, `docs/architecture/workspace/agents.md`, `docs/architecture/workspace/instruction-files.md`, `apps/cli-e2e/src/scope-consistency.e2e.test.ts`, `apps/cli-e2e/src/activation-lifecycle.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/scope-consistency.e2e.test.ts`](../apps/cli-e2e/src/scope-consistency.e2e.test.ts) — Runs Pack, Knowledge and Subagent operations in a populated user workspace and verifies that the populated project workspace and native projections remain byte-identical.
- Source: [`apps/cli-e2e/src/installed-state-stays-in-selected-scope.spec.ts`](../apps/cli-e2e/src/installed-state-stays-in-selected-scope.spec.ts)

##### Disabling instruction-file management removes only what AXM owns

- Requirement: `cli/instructions/disable/removes-only-owned-aliases`
- Owner: `workspace-configuration`
- Statement: When instruction-file management is disabled, AXM shall record the choice in axm.json and remove only the alias files and ignore regions it owns, and shall preserve authored instruction content and unrelated ignore entries.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Open questions: When a configured alias path contains an unowned human file, current disable refuses the whole operation; decide whether disabling should preserve that file and still record disabled management. The current preservation promise does not independently choose that policy.
- Source: [`packages/core/workspace-configuration/src/instructions/removes-only-owned-aliases.spec.ts`](../packages/core/workspace-configuration/src/instructions/removes-only-owned-aliases.spec.ts)

##### Enabling instruction-file management records the explicit choice and reconciles aliases together

- Requirement: `cli/instructions/enable/records-choice-and-reconciles-aliases`
- Owner: `workspace-configuration`
- Statement: When instruction-file management is enabled, AXM shall record the explicit choice and its source file in axm.json and shall reconcile the alias files and ignore regions it owns in the same operation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`, `cli/mutations-are-closure-atomic`, `cli/invalid-ownership-markers-block-reconciliation`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`packages/core/workspace-configuration/src/instructions/records-choice-and-reconciles-aliases.spec.ts`](../packages/core/workspace-configuration/src/instructions/records-choice-and-reconciles-aliases.spec.ts)

##### Instruction-file status is inspected without changing workspace state

- Requirement: `cli/instructions/status-reports-without-changing-state`
- Owner: `workspace-configuration`
- Statement: When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent together with stale owned aliases, and shall not change settings or instruction files.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`packages/core/workspace-configuration/src/instructions/status-reports-without-changing-state.spec.ts`](../packages/core/workspace-configuration/src/instructions/status-reports-without-changing-state.spec.ts)

##### Invalid ownership markers prevent changes to generated documents

- Requirement: `cli/invalid-ownership-markers-block-reconciliation`
- Owner: `workspace-sync`
- Statement: When a generated document carries an ownership marker AXM cannot validate, reconciliation shall report a blocked outcome and shall not alter the document.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/projection-currency-follows-state-authority`
- Limitation: The statement no longer carries the lint half of the rule — that a workspace lint run reports the invalid ownership as `workspace/projection-ownership-valid` and leaves the document untouched. A reconciliation specification cannot witness a peer feature's finding, and no ordinary test in `@agentxm/workspace-lint` exercises that rule against an unvalidatable marker yet; the rule's identity and severity are meanwhile owned by cli/lint/catalog-is-complete and lint's no-mutation obligation by cli/lint/reports-facts-without-mutation. Retires when: `@agentxm/workspace-lint` carries an ordinary test that runs the real workspace lint over a document whose ownership marker cannot be validated and asserts the `workspace/projection-ownership-valid` finding with the document unchanged.
- Source: [`packages/core/workspace-sync/src/invalid-ownership-markers-block-reconciliation.spec.ts`](../packages/core/workspace-sync/src/invalid-ownership-markers-block-reconciliation.spec.ts)

##### Invalid workspace settings or lockfiles block workspace operations

- Requirement: `cli/invalid-workspace-state-gates-operations`
- Owner: `workspace-state`
- Statement: When a present project or user settings file, or a present workspace lockfile in the selected scope, is malformed, schema-invalid, unreadable, or of an unsupported version, operations that read or change workspace state, including diagnosis and preview, shall stop before workspace work begins with a validation error naming the file, the observed fault, and a non-destructive recovery route, and shall change no workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Boundary rationale: The gate is the construction of the workspace records themselves: every operation reads them first, so the typed refusal and the untouched files on disk are the decisive evidence.
- Methods: decision-table, example
- Derived from: `cli/settings-validity-gates-operations`, `cli/workspace-lockfile-rejections-name-state-and-recovery`, `cli/lockfile-version-errors-expose-structured-problem`, `apps/cli/src/root/invalid-workspace-state-gates-operations.test.ts`
- Supersedes: `cli/settings-validity-gates-operations`, `cli/workspace-lockfile-rejections-name-state-and-recovery`, `cli/lockfile-version-errors-expose-structured-problem`
- Additional evidence: process via [`apps/cli-e2e/src/skills.e2e.test.ts`](../apps/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Additional evidence: process via [`apps/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../apps/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Additional evidence: process via [`apps/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../apps/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`packages/core/workspace-state/src/workspace/invalid-workspace-state-gates-operations.spec.ts`](../packages/core/workspace-state/src/workspace/invalid-workspace-state-gates-operations.spec.ts)

##### Local inventories can run before setup

- Requirement: `cli/inventories-can-run-before-setup`
- Owner: `workspace-inspection`
- Statement: When listing local extensions before workspace setup, AXM shall report detected entries or an empty inventory without requiring or creating workspace settings and resolution state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/skills/list.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`, `packages/core/workspace-inspection/src/type-list/type-lists.ts`
- Additional evidence: process via [`apps/cli-e2e/src/skills.e2e.test.ts`](../apps/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`packages/core/workspace-inspection/src/inventories-can-run-before-setup.spec.ts`](../packages/core/workspace-inspection/src/inventories-can-run-before-setup.spec.ts)

##### Lint holds a declared official AXM skill to compatibility

- Requirement: `cli/lint/declared-official-skill-must-be-compatible`
- Owner: `workspace-lint`
- Statement: When the workspace declares the official AXM skill, lint shall report a compatibility error and fail when the declared skill is missing, incompatible, skewed, authored, or unreadable, and shall report clean and succeed when the skill and CLI satisfy the declared bounded compatibility range, including prerelease versions within that range.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: Each state is a declaration plus a canonical package on a real workspace directory, evaluated against a pinned CLI release; the built executable adjudicates nothing this rule decides.
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`, `apps/cli/help/topics/upgrade.md`, `apps/cli-e2e/src/lint/startup-check-does-not-hide-findings.e2e.test.ts`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Additional evidence: process via [`apps/cli-e2e/src/lint/startup-check-does-not-hide-findings.e2e.test.ts`](../apps/cli-e2e/src/lint/startup-check-does-not-hide-findings.e2e.test.ts) — Only a real CLI invocation composes the startup update check alongside the lint path, so only a process can show that disabling the check leaves the local compatibility finding in place.
- Source: [`packages/core/workspace-lint/src/catalog/workspace/declared-official-skill-must-be-compatible.spec.ts`](../packages/core/workspace-lint/src/catalog/workspace/declared-official-skill-must-be-compatible.spec.ts)

##### Lint reports an undeclared official AXM skill as informational

- Requirement: `cli/lint/undeclared-official-skill-is-informational`
- Owner: `workspace-lint`
- Statement: When the workspace does not declare the official AXM skill, lint shall report one informational finding for the declared-skill rule, shall report no compatibility finding, and shall succeed.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The rule reads a declaration and a canonical package off a real workspace directory; nothing about it needs a process.
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/catalog/workspace/undeclared-official-skill-is-informational.spec.ts`](../packages/core/workspace-lint/src/catalog/workspace/undeclared-official-skill-is-informational.spec.ts)

##### Update listings use each installation’s recorded Registry

- Requirement: `cli/list/assesses-updates-through-recorded-registry`
- Owner: `workspace-inspection`
- Statement: When listing outdated extensions, AXM shall assess installed extensions, including disabled installations, against their recorded Registry source and return those with a newer version that satisfies the recorded version constraint.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Open questions: Should Git update assessment treat a changed commit with an unchanged extension tree as an available update? Current code compares both identities; Registry version eligibility is the accepted scope of this requirement.
- Source: [`packages/core/workspace-inspection/src/extension-list/assesses-updates-through-recorded-registry.spec.ts`](../packages/core/workspace-inspection/src/extension-list/assesses-updates-through-recorded-registry.spec.ts)

##### List exposes failed Registry assessment

- Requirement: `cli/list/fails-when-registry-assessment-fails`
- Owner: `workspace-inspection`
- Statement: When a requested Registry assessment fails, AXM shall fail the list command without presenting a successful empty or current assessment.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Source: [`packages/core/workspace-inspection/src/extension-list/fails-when-registry-assessment-fails.spec.ts`](../packages/core/workspace-inspection/src/extension-list/fails-when-registry-assessment-fails.spec.ts)

##### Human inventories point readers at the deprecation guidance command

- Requirement: `cli/list/human-inventory-points-to-deprecation-guidance`
- Owner: `cli`
- Statement: When an ordinary inventory rendered for a person includes a deprecated installation, AXM shall name the command that reports that extension's full deprecation guidance.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/list/ordinary-inventory-identifies-deprecation`, `apps/cli/src/root/list/command.ts`
- Source: [`apps/cli/src/root/list/human-inventory-points-to-deprecation-guidance.spec.ts`](../apps/cli/src/root/list/human-inventory-points-to-deprecation-guidance.spec.ts)

##### Ordinary listings identify deprecation without its detail

- Requirement: `cli/list/ordinary-inventory-identifies-deprecation`
- Owner: `workspace-inspection`
- Statement: When an ordinary inventory includes a deprecated installation, AXM shall identify its deprecation status and shall not carry the deprecation detail that the deprecation listing reports.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Source: [`packages/core/workspace-inspection/src/extension-list/ordinary-inventory-identifies-deprecation.spec.ts`](../packages/core/workspace-inspection/src/extension-list/ordinary-inventory-identifies-deprecation.spec.ts)

##### List rejects incompatible remote filters

- Requirement: `cli/list/rejects-incompatible-filters`
- Owner: `cli`
- Statement: When both outdated and deprecated filters are requested, AXM shall reject the list invocation as a usage failure before querying Registry state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `apps/cli/src/root/list/command.ts`
- Source: [`apps/cli/src/root/list/rejects-incompatible-filters.spec.ts`](../apps/cli/src/root/list/rejects-incompatible-filters.spec.ts)

##### Deprecation listings report available replacement guidance

- Requirement: `cli/list/reports-deprecation-guidance`
- Owner: `workspace-inspection`
- Statement: When listing deprecated installations, AXM shall return the Registry’s deprecation message and replacement availability for each matching installation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Source: [`packages/core/workspace-inspection/src/extension-list/reports-deprecation-guidance.spec.ts`](../packages/core/workspace-inspection/src/extension-list/reports-deprecation-guidance.spec.ts)

##### List reports incomplete Registry assessment

- Requirement: `cli/list/reports-incomplete-assessment`
- Owner: `workspace-inspection`
- Statement: When an installation’s recorded Registry source is not configured or its extension index is not found, AXM shall mark that assessment as unknown in coverage instead of treating it as a confirmed current installation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Source: [`packages/core/workspace-inspection/src/extension-list/reports-incomplete-assessment.spec.ts`](../packages/core/workspace-inspection/src/extension-list/reports-incomplete-assessment.spec.ts)

##### List reports the current inventory across extension types

- Requirement: `cli/list/reports-the-cross-type-inventory`
- Owner: `workspace-inspection`
- Statement: When listing extensions, AXM shall report the current local inventory across all extension types or only the explicitly selected type, including configured extensions that are disabled or missing.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/list/command.test.ts`, `packages/core/workspace-inspection/src/extension-list/list-extensions.ts`
- Source: [`packages/core/workspace-inspection/src/extension-list/reports-the-cross-type-inventory.spec.ts`](../packages/core/workspace-inspection/src/extension-list/reports-the-cross-type-inventory.spec.ts)

##### A lockfile row alone never makes an extension desired or retained

- Requirement: `cli/lock-state-never-creates-reachability`
- Owner: `workspace-state`
- Statement: An accepted-resolution row in the lockfile that no settings entry desires shall not cause the workspace to acquire, realize, or report that extension or pack as present.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Boundary rationale: Reachability is decided where desired state is read: the settings entries and the accepted resolutions are both on disk, and the records built from them are what every command downstream consults.
- Methods: decision-table, contract
- Derived from: `packages/core/workspace-sync/src/lock-only-rows-are-never-acquired.test.ts`
- Source: [`packages/core/workspace-state/src/workspace/lock-state-never-creates-reachability.spec.ts`](../packages/core/workspace-state/src/workspace/lock-state-never-creates-reachability.spec.ts)

##### Managed output points to an editable source or to the fork command

- Requirement: `cli/managed-projection-guidance-respects-authority`
- Owner: `workspace-projection`
- Statement: A managed projection shall direct edits to its source only when the workspace authors that extension, and for an acquired extension shall mark the canonical content immutable and point to axm fork instead.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `knowledge-access`
- Boundary: memory; selection: per-change
- Boundary rationale: The banner is composed from the provenance record a projection carries; giving the projection that record directly is what decides the guidance, and rendering it shows exactly the operator text a person reads.
- Methods: decision-table, example
- Source: [`packages/core/workspace-projection/src/managed-projection-guidance-respects-authority.spec.ts`](../packages/core/workspace-projection/src/managed-projection-guidance-respects-authority.spec.ts)

##### Adding an inline MCP server records it as authored configuration and realizes it

- Requirement: `cli/mcps/add/records-and-realizes-inline-configuration`
- Owner: `workspace-configuration`
- Statement: When an inline MCP server is added by command or url, AXM shall record it in axm.json as authored configuration, realize it in the native configuration of configured agents that can represent it, and report the applied change.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/mcps/projects-to-every-configured-agent`, `cli/mcps/inline-entries-are-authoritative-as-authored`, `packages/core/workspace-configuration/src/inline-mcp/add-inline-mcp-server.ts`, `apps/cli/help/topics/mcps.md`
- Additional evidence: process via [`apps/cli-e2e/src/command.e2e.test.ts`](../apps/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Source: [`packages/core/workspace-configuration/src/inline-mcp/add-records-and-realizes-inline-configuration.spec.ts`](../packages/core/workspace-configuration/src/inline-mcp/add-records-and-realizes-inline-configuration.spec.ts)

##### An imported MCP server is adopted once and reaches every configured agent

- Requirement: `cli/mcps/import/adoption-reaches-every-configured-agent`
- Owner: `workspace-configuration`
- Statement: When an MCP server found in one agent's native configuration is imported without --as, AXM shall record it once without an agent subset and shall report every native target it will write in preview and apply.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/mcps/projects-to-every-configured-agent`, `cli/sync/realizes-desired-state`, `packages/core/workspace-configuration/src/mcp-import/import-mcp-servers.ts`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so a server present in one file and absent from the other observes adoption reaching a second agent.
- Source: [`packages/core/workspace-configuration/src/mcp-import/adoption-reaches-every-configured-agent.spec.ts`](../packages/core/workspace-configuration/src/mcp-import/adoption-reaches-every-configured-agent.spec.ts)

##### Inline MCP entries stay authoritative exactly as authored

- Requirement: `cli/mcps/inline-entries-are-authoritative-as-authored`
- Owner: `workspace-state`
- Statement: An inline MCP entry authored in axm.json shall remain the authoritative configuration exactly as written when other entries are changed, shall be carried as inline authority in desired state, and shall never gain an accepted resolution.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-authority-is-operation-coherent`, `cli/mcps/projects-to-every-configured-agent`
- Supersedes: `cli/mcps/inline-authority-is-operation-coherent`
- Source: [`packages/core/workspace-state/src/settings/inline-mcp-entries-are-authoritative-as-authored.spec.ts`](../packages/core/workspace-state/src/settings/inline-mcp-entries-are-authoritative-as-authored.spec.ts)

##### The human MCP inventory shows local name and source as separate columns

- Requirement: `cli/mcps/list/human-inventory-separates-local-name-and-source`
- Owner: `cli`
- Statement: When MCP servers are listed in human output, AXM shall present each connection's local name, its source, and its resolved version as separate columns, so that connections sharing one source remain individually identifiable.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/list/local-name-source-and-resolution-are-distinct`
- Source: [`apps/cli/src/root/mcps/list/human-inventory-separates-local-name-and-source.spec.ts`](../apps/cli/src/root/mcps/list/human-inventory-separates-local-name-and-source.spec.ts)

##### Uninstall removes one local MCP connection and retains shared source state

- Requirement: `cli/mcps/uninstall/removes-one-local-connection-at-a-time`
- Owner: `extension-lifecycle`
- Statement: When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/extension-lifecycle/src/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts`](../packages/core/extension-lifecycle/src/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts)

##### Updating one locally named connection advances every connection sharing its source

- Requirement: `cli/mcps/update/shared-source-update-is-closure-wide`
- Owner: `extension-lifecycle`
- Statement: When an update targets one locally named MCP connection, AXM shall advance the single accepted resolution of its shared source and refresh the agent configuration of every connection to that source, rather than advancing the named connection alone.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/extension-lifecycle/src/mcps/update/shared-source-update-is-closure-wide.spec.ts`](../packages/core/extension-lifecycle/src/mcps/update/shared-source-update-is-closure-wide.spec.ts)

##### Pack inspection refuses mismatched and unavailable targets

- Requirement: `cli/packs/show/rejects-mismatched-and-unavailable-packs`
- Owner: `workspace-inspection`
- Statement: When the requested target is not a configured pack, is not a pack identity, names another owner's pack, or its canonical manifest is unavailable or malformed, AXM shall refuse the inspection and produce no pack state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-inspection/src/packs/show-pack.ts`
- Source: [`packages/core/workspace-inspection/src/packs/show-rejects-mismatched-and-unavailable-packs.spec.ts`](../packages/core/workspace-inspection/src/packs/show-rejects-mismatched-and-unavailable-packs.spec.ts)

##### Pack inspection reports declared members and observed state

- Requirement: `cli/packs/show/reports-authored-membership-and-observed-state`
- Owner: `workspace-inspection`
- Statement: When inspecting a configured pack, AXM shall report the pack’s source authority, canonical manifest, declared member constraints, and desired dependency reachability.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-inspection/src/packs/show-pack.ts`, `apps/cli-e2e/src/scope-consistency.e2e.test.ts`
- Open questions: The current pack result reports member version as null and derives reachability from desired graph presence. Should future inspection distinguish desired membership from verified installed member resolution and exclusions?
- Source: [`packages/core/workspace-inspection/src/packs/show-reports-authored-membership-and-observed-state.spec.ts`](../packages/core/workspace-inspection/src/packs/show-reports-authored-membership-and-observed-state.spec.ts)

##### The one-shot release-age override reaches every command the gate can block

- Requirement: `cli/policy-overrides-reach-every-blocked-command`
- Owner: `cli`
- Statement: Every command whose outcome the minimum release age can change shall accept --ignore-release-age; that flag shall carry the same one-shot meaning on every command that accepts it; and no other flag shall grant that bypass.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table, static
- Derived from: `cli/force-bypasses-only-named-policies`
- Open questions: Whether enabling an already-installed extension should resolve from source at all, or should read only the accepted resolution and never reach the gate. Activation accepts the override today because the gate can block it today; deciding that question may remove activation from the gated inventory instead.
- Limitation: The one-shot meaning is exercised through each handler the flag reaches — root install, root update, sync, the shared workspace install, and the shared workspace update — rather than once per registered command path. Commands routing into the same handler share its behavior by construction, and the registration and parser checks below do cover every path. Retires when: The specification harness exports a driver for every gate-blockable command path, letting the decision table run per path.
- Source: [`apps/cli/src/cli-flags/policy-overrides-reach-every-blocked-command.spec.ts`](../apps/cli/src/cli-flags/policy-overrides-reach-every-blocked-command.spec.ts)

##### Publication selectors and filters narrow the workspace-authored set

- Requirement: `cli/publication-selects-matching-authored-extensions`
- Owner: `extension-publish`
- Statement: Root publish shall select matching workspace-authored extensions using fully qualified or type-qualified selectors and globs or argument-free owner, type and exclusion filters, while type-specific publication shall interpret its names, globs, fully qualified selectors and filters only within that type, each defaulting to all authored candidates in its scope.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Selection is decided by the publish use case over the workspace's authored records; running it against a real file Registry shows exactly which archives the selection distributed.
- Methods: decision-table, example
- Derived from: `cli/publish/selectors-and-filters-narrow-authored-candidates`, `apps/cli/help/topics/publish.md`, `apps/cli/src/root/publish/command.ts`, `apps/cli/src/root/publish/per-type-command.ts`
- Supersedes: `cli/publish/selectors-and-filters-narrow-authored-candidates`
- Open questions: For an explicit selector with no match, including a fully qualified name of another type at a type-specific command, which diagnostic and result status are required? The selection must not broaden, but this owner does not fix the no-match reporting policy.
- Limitation: The examples use file Registry destinations and a bounded selector/filter decision table. They do not establish every glob shape, repeated-filter combination, or remote Registry interaction. Retires when: Retain the type-bound selection evidence while adding any newly accepted selector grammar and interaction cases under their exact applicability.
- Source: [`packages/core/extension-publish/src/selection/publication-selects-matching-authored-extensions.spec.ts`](../packages/core/extension-publish/src/selection/publication-selects-matching-authored-extensions.spec.ts)

##### Pack dependency inclusion adds only workspace-authored members

- Requirement: `cli/publish/dependency-inclusion-adds-only-authored-pack-members`
- Owner: `extension-publish`
- Statement: For a selected pack, publish shall add its workspace-authored dependencies only when dependency inclusion is explicitly requested, retain external dependencies as Registry references, and leave unrelated authored extensions outside the selection.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/publish.md`, `apps/cli/src/root/publish/command.ts`
- Source: [`packages/core/extension-publish/src/selection/dependency-inclusion-adds-only-authored-pack-members.spec.ts`](../packages/core/extension-publish/src/selection/dependency-inclusion-adds-only-authored-pack-members.spec.ts)

##### Relative paths start in the selected directory

- Requirement: `cli/relative-paths-start-in-selected-directory`
- Owner: `cli-e2e`
- Statement: AXM shall resolve relative command paths and configured local sources from the selected workspace directory.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `apps/cli-e2e/src/directory.e2e.test.ts`, `apps/cli/help/topics/basic-usage.md`, `apps/cli/help/topics/environment.md`
- Source: [`apps/cli-e2e/src/relative-paths-start-in-selected-directory.spec.ts`](../apps/cli-e2e/src/relative-paths-start-in-selected-directory.spec.ts)

##### Setup treats coding-agent membership as a set

- Requirement: `cli/setup/agent-membership-is-a-set`
- Owner: `workspace-configuration`
- Statement: When setup resolves coding-agent membership, it shall offer each configurable agent exactly once however many configuration, detection, or suggestion sources name that agent, and shall record the resolved membership as a set, so overlapping evidence or a repeated request never yields a duplicated agent or an unwritable workspace.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/workspace-configuration/src/setup/initialization.ts`
- Source: [`packages/core/workspace-configuration/src/setup/agent-membership-is-a-set.spec.ts`](../packages/core/workspace-configuration/src/setup/agent-membership-is-a-set.spec.ts)

##### Setup initializes the selected workspace

- Requirement: `cli/setup/initializes-selected-workspace`
- Owner: `cli`
- Statement: When setup is approved with explicit scope and agents for an uninitialized directory, AXM shall create the selected workspace settings, lockfile, and bundled AXM skill for those agents while preserving other scopes.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Boundary rationale: Creating the settings document and lockfile belongs to the configuration feature while the bundled official skill travels with the executable, so the application layer that composes both is the lowest layer at which one initialization produces all three; the artifacts it writes are files in a real directory.
- Methods: example
- Derived from: `cli/setup/unattended-apply-requires-explicit-intent`
- Additional evidence: process via [`apps/cli-e2e/src/init.e2e.test.ts`](../apps/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`apps/cli/src/root/setup/initializes-selected-workspace.spec.ts`](../apps/cli/src/root/setup/initializes-selected-workspace.spec.ts)

##### A setup preview resolves every input it would otherwise ask about, and says how

- Requirement: `cli/setup/preview-resolves-inputs-without-prompts`
- Owner: `workspace-configuration`
- Statement: When setup runs in preview mode, it shall resolve every input an interactive run would ask about — the coding agents to configure and the instruction source to use — without raising a prompt, shall present the same candidate whether or not the request preapproved it, and shall name how each default was chosen.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/setup/preview-is-pure`
- Source: [`packages/core/workspace-configuration/src/setup/preview-resolves-inputs-without-prompts.spec.ts`](../packages/core/workspace-configuration/src/setup/preview-resolves-inputs-without-prompts.spec.ts)

##### Repeated setup preserves the existing workspace

- Requirement: `cli/setup/rerun-preserves-existing-configuration`
- Owner: `workspace-configuration`
- Statement: When setup runs against an initialized workspace, AXM shall preserve its settings, lockfile, authored content, and agent outputs even if different agents are supplied, directing membership changes to the agent commands.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/setup/initializes-selected-workspace`
- Additional evidence: process via [`apps/cli-e2e/src/init.e2e.test.ts`](../apps/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`packages/core/workspace-configuration/src/setup/rerun-preserves-existing-configuration.spec.ts`](../packages/core/workspace-configuration/src/setup/rerun-preserves-existing-configuration.spec.ts)

##### An unattended setup applies only what the request said explicitly

- Requirement: `cli/setup/unattended-apply-requires-explicit-intent`
- Owner: `workspace-configuration`
- Statement: When setup would apply unattended to a workspace that has no settings, AXM shall apply only when preapproval, an explicit scope, and at least one explicit agent are all present, and shall otherwise report that approval is required without writing anything.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/machine-mode-never-prompts`
- Additional evidence: process via [`apps/cli-e2e/src/init.e2e.test.ts`](../apps/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`packages/core/workspace-configuration/src/setup/unattended-apply-requires-explicit-intent.spec.ts`](../packages/core/workspace-configuration/src/setup/unattended-apply-requires-explicit-intent.spec.ts)

##### Bundled official-skill recovery rewrites the settings entry to bundled ownership and retires the Registry resolution

- Requirement: `cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution`
- Owner: `extension-lifecycle`
- Statement: When the workspace desires the official AXM skill from the Registry, installing the bundled official AXM skill shall rewrite that skill's axm.json entry to bundled workspace-owned content, retire its accepted Registry resolution, materialize the canonical content and the agent projection, leave every other accepted resolution intact, and change nothing when repeated.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/install/bundled-recovery-converges`, `cli/lint/declared-official-skill-must-be-compatible`, `cli/lint/compatibility-result-names-reason-and-recovery`, `apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts`
- Supersedes: `cli/skills/install/bundled-recovery-converges`
- Source: [`packages/core/extension-lifecycle/src/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution.spec.ts`](../packages/core/extension-lifecycle/src/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution.spec.ts)

##### Bundled official-skill recovery never overwrites a workspace-authored official skill

- Requirement: `cli/skills/install/preserves-authored-official-skill`
- Owner: `extension-lifecycle`
- Statement: When the workspace authors a skill named axm, installing the bundled official AXM skill shall be blocked before any change in preview and in a forced apply, shall name the authored skill as the cause, and shall leave configuration, lock state, and the authored source byte-for-byte intact.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/install/bundled-recovery-converges`
- Supersedes: `cli/skills/install/bundled-recovery-converges`
- Source: [`packages/core/extension-lifecycle/src/skills/install/preserves-authored-official-skill.spec.ts`](../packages/core/extension-lifecycle/src/skills/install/preserves-authored-official-skill.spec.ts)

##### Sync never changes configuration and never advances a satisfying resolution

- Requirement: `cli/sync/preserves-configuration-and-resolutions`
- Owner: `workspace-sync`
- Statement: Sync shall never rewrite axm.json or alter an accepted resolution that still satisfies its constraint, and shall restore realized content from the accepted resolution even when a newer version is available.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/workspace-sync/src/preserves-configuration-and-resolutions.spec.ts`](../packages/core/workspace-sync/src/preserves-configuration-and-resolutions.spec.ts)

##### Sync never removes agent-native content without AXM ownership proof

- Requirement: `cli/sync/preserves-unowned-agent-content`
- Owner: `workspace-sync`
- Statement: When sync retires agent-native content that desired state no longer reaches, it shall remove only content AXM can prove it owns and shall leave hand-authored neighbors in the same agent directory untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/workspace-sync/src/preserves-unowned-agent-content.spec.ts`](../packages/core/workspace-sync/src/preserves-unowned-agent-content.spec.ts)

##### Agent filters match any selected agent

- Requirement: `cli/type-list-agent-filters-match-any-selected-agent`
- Owner: `workspace-inspection`
- Statement: When filtering skill or subagent inventories by agents, AXM shall include entries observed by any selected agent and exclude entries observed by none of them.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/skills/list.test.ts`, `apps/cli/src/root/subagents/list/handler.test.ts`
- Source: [`packages/core/workspace-inspection/src/type-list-agent-filters-match-any-selected-agent.spec.ts`](../packages/core/workspace-inspection/src/type-list-agent-filters-match-any-selected-agent.spec.ts)

##### Type inspection identifies missing entries

- Requirement: `cli/type-shows-report-missing-entries`
- Owner: `cli`
- Statement: When a skills show, mcps show, subagents show, rules show, hooks show, or knowledge show target has no configured, installed, or detected local entry, AXM shall report that entry as not found with a command for inspecting the available entries.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/shared/extension-show.test.ts`, `apps/cli/src/root/shared/extension-show.ts`
- Source: [`apps/cli/src/root/shared/type-shows-report-missing-entries.spec.ts`](../apps/cli/src/root/shared/type-shows-report-missing-entries.spec.ts)

##### Uninstall retires a desired pack whose package cannot be read

- Requirement: `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`
- Owner: `extension-lifecycle`
- Statement: When uninstall targets a desired pack whose package manifest is missing or cannot be decoded, and every other desired pack is intact, AXM shall remove the pack's configuration and accepted resolution, shall delete no content it could not verify, shall report the removal as registration-only naming the unreadable manifest, and shall reach the same decision in preview and apply; when any other desired pack is incomplete, AXM shall remain blocked and shall change nothing.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Assumptions: A pack's member list is not persisted outside its package manifest; neither axm.json nor axm-lock.yaml carries one, so an unreadable manifest leaves members computable only from the remaining desired state.
- Additional evidence: process via [`apps/cli-e2e/src/root-uninstall.e2e.test.ts`](../apps/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`packages/core/extension-lifecycle/src/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts`](../packages/core/extension-lifecycle/src/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts)

##### A Knowledge bundle AXM cannot read is left out of the instructions file and reported

- Requirement: `cli/unreadable-knowledge-is-left-out-and-reported`
- Owner: `extension-lifecycle`
- Statement: When a desired Knowledge bundle's package cannot be read, AXM shall leave that bundle out of the generated instructions file, shall report the omission with its reason and remedy on every command that writes or inspects that file, and shall not fail another extension's operation because of it.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Boundary rationale: The omission is decided while the instructions file is projected and is reported on the unit that projected it; running a real removal over a real workspace shows both the file that was written and the report that accompanied it.
- Methods: example
- Derived from: `packages/core/extension-lifecycle/src/knowledge/manager.ts`, `packages/core/workspace-projection/src/planning.ts`, `packages/core/workspace-sync/src/knowledge-exclusions-are-reported.test.ts`, `packages/core/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts`
- Source: [`packages/core/extension-lifecycle/src/knowledge/unreadable-knowledge-is-left-out-and-reported.spec.ts`](../packages/core/extension-lifecycle/src/knowledge/unreadable-knowledge-is-left-out-and-reported.spec.ts)

##### Unusable directories fail before the command runs

- Requirement: `cli/unusable-directories-fail-before-command`
- Owner: `cli-e2e`
- Statement: When a selected directory is missing, is a file, or cannot be traversed, AXM shall report a usage failure before executing the command or changing workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `apps/cli-e2e/src/directory.e2e.test.ts`, `apps/cli/help/topics/basic-usage.md`
- Source: [`apps/cli-e2e/src/unusable-directories-fail-before-command.spec.ts`](../apps/cli-e2e/src/unusable-directories-fail-before-command.spec.ts)

##### Targeted update routes bundled source to its converging recovery

- Requirement: `cli/update/bundled-source-routes-to-recovery`
- Owner: `extension-lifecycle`
- Statement: When a targeted update names an extension whose source is bundled with the AXM executable, the update shall be blocked in preview and apply as a policy exclusion naming the bundled source, without contacting any Registry or changing workspace state, and the blocked outcome shall carry the bundled source as the fact a recovery route is offered for.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/machine-result-names-bundled-source-blocker`, `apps/cli/src/root/update/blocker-suggestions.test.ts`
- Supersedes: `cli/update/machine-result-names-bundled-source-blocker`
- Source: [`packages/core/extension-lifecycle/src/update/bundled-source-routes-to-recovery.spec.ts`](../packages/core/extension-lifecycle/src/update/bundled-source-routes-to-recovery.spec.ts)

##### Update is blocked for an extension the workspace does not desire

- Requirement: `cli/update/refuses-undesired-extensions`
- Owner: `extension-lifecycle`
- Statement: When an update names an extension the workspace does not desire, the update shall be blocked as an unmet precondition before any change and shall leave configuration, lock state, and acquired content untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/advances-resolution-within-intent`
- Source: [`packages/core/extension-lifecycle/src/update/refuses-undesired-extensions.spec.ts`](../packages/core/extension-lifecycle/src/update/refuses-undesired-extensions.spec.ts)

##### Visibility reconciliation applies repository intent at the observed Registry revision

- Requirement: `cli/visibility/reconcile/applies-declared-repository-intent`
- Owner: `extension-publish`
- Statement: The visibility reconcile command shall require project-scoped manifest or workspace visibility intent and established Registry visibility, submit the effective intent with its source fingerprint as repository authority conditional on the observed revision, and report only the acknowledged transition.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/src/root/visibility/handler.ts`, `AgentXM Registry API 0.1.0`
- Source: [`packages/core/extension-publish/src/visibility/reconcile-applies-declared-repository-intent.spec.ts`](../packages/core/extension-publish/src/visibility/reconcile-applies-declared-repository-intent.spec.ts)

##### Resolution withholds a release that has not aged, unless it is exempt

- Requirement: `source-resolution/minimum-release-age-withholds-unaged-releases`
- Owner: `extension-resolution`
- Statement: When a resolution selects a release without an explicit version request, the resolution shall withhold a candidate that has not reached the configured minimum release age unless that candidate's identity matches a declared exemption, and every withheld and every exempted candidate shall be reported with its eligibility time and, when exempted, its exemption cause and scope.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Assumptions: A held release is refused before anything is written: cli/mutations-are-closure-atomic owns that a refused closure leaves the workspace unchanged, and cli/withheld-releases-name-recovery-from-the-emitting-command owns the wording and recovery routes the refusal names.
- Source: [`packages/core/extension-resolution/src/release-age/minimum-release-age-withholds-unaged-releases.spec.ts`](../packages/core/extension-resolution/src/release-age/minimum-release-age-withholds-unaged-releases.spec.ts)

#### Constraints

##### A sync check requires preview mode

- Requirement: `cli/sync/check-requires-preview`
- Owner: `cli`
- Statement: When sync is invoked with --fail-on-change without --preview, AXM shall reject the invocation as a usage error naming the supported spelling, before applying any workspace change.
- Class: constraint
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The refusal is a grammar decision the adapter makes before any parser-independent workspace work begins; the exit status it maps to is owned by cli/exit-codes-match-published-reference and the machine envelope by cli/machine-errors-use-the-stable-envelope.
- Methods: example
- Derived from: `apps/cli/src/root/sync/handler.ts`
- Source: [`apps/cli/src/root/sync/check-requires-preview.spec.ts`](../apps/cli/src/root/sync/check-requires-preview.spec.ts)

## Programmatic interfaces

### Goal: actionable-diagnostics

People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.

#### Functional

##### Lint distinguishes AXM-owned residue from genuinely undeclared agents

- Requirement: `cli/lint/distinguishes-owned-residue-from-undeclared-agents`
- Owner: `workspace-lint`
- Statement: When a workspace still contains AXM-owned projections for an agent that is no longer declared, lint shall report that residue as stale projections and shall not report the agent as detected but undeclared.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Ownership is decided from the link a real agent directory entry carries into a canonical root, so a real workspace directory is the whole evidence this rule needs.
- Methods: example
- Source: [`packages/core/workspace-lint/src/catalog/workspace/distinguishes-owned-residue-from-undeclared-agents.spec.ts`](../packages/core/workspace-lint/src/catalog/workspace/distinguishes-owned-residue-from-undeclared-agents.spec.ts)

##### Lint findings identify the violated invariant and affected subject as facts

- Requirement: `cli/lint/findings-name-the-violated-invariant`
- Owner: `workspace-lint`
- Statement: When lint reports a finding in machine output mode, the finding shall carry a stable rule identity, the affected subject, the deciding authority, the observed state, the expected invariant, and its location.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Boundary rationale: The finding's fact fields are fields of the feature's own machine document; the envelope that carries it to a consumer is the CLI's concern, not this rule's.
- Methods: contract
- Additional evidence: process via [`apps/cli-e2e/src/lint.e2e.test.ts`](../apps/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`packages/core/workspace-lint/src/document/findings-name-the-violated-invariant.spec.ts`](../packages/core/workspace-lint/src/document/findings-name-the-violated-invariant.spec.ts)

##### Sync identifies the shared output that needs updating

- Requirement: `cli/sync/reports-aggregate-projection-drift-at-unit-precision`
- Owner: `workspace-sync`
- Statement: When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract, example
- Source: [`packages/core/workspace-sync/src/reports-aggregate-projection-drift-at-unit-precision.spec.ts`](../packages/core/workspace-sync/src/reports-aggregate-projection-drift-at-unit-precision.spec.ts)

### Goal: authoring-and-creation

Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.

#### Functional

##### A companion package names an ecosystem package identity, never a pinned version

- Requirement: `package-identity/companion-packages-are-identities-not-pins`
- Owner: `extension-model`
- Statement: A companion package shall be declared by a versionless package identity, and a declaration that pins a version shall be refused with guidance toward the compatibility range.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`packages/core/extension-model/src/unstable/package-urls/companion-packages-are-identities-not-pins.spec.ts`](../packages/core/extension-model/src/unstable/package-urls/companion-packages-are-identities-not-pins.spec.ts)

##### Companion packages and their compatibility ranges name a supported package ecosystem

- Requirement: `package-identity/companion-packages-use-a-supported-ecosystem`
- Owner: `extension-model`
- Statement: A companion package identity and its compatibility range shall each name a supported concrete package ecosystem, and a declaration naming a generic version scheme or an ecosystem the product does not support shall be refused with guidance naming that ecosystem.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `package-identity/companion-packages-are-identities-not-pins`, `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Source: [`packages/core/extension-model/src/unstable/package-urls/companion-packages-use-a-supported-ecosystem.spec.ts`](../packages/core/extension-model/src/unstable/package-urls/companion-packages-use-a-supported-ecosystem.spec.ts)

##### A companion compatibility range is a well-formed vers range with at least one plain constraint

- Requirement: `package-identity/compatibility-ranges-are-well-formed`
- Owner: `extension-model`
- Statement: A companion compatibility range shall be a vers range with the vers prefix, an ecosystem scheme, and at least one plain constraint, and a range that omits the prefix, carries no constraint, is wildcard-only, or percent-encodes its constraints shall be refused with guidance naming the flaw.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Source: [`packages/core/extension-model/src/unstable/package-urls/compatibility-ranges-are-well-formed.spec.ts`](../packages/core/extension-model/src/unstable/package-urls/compatibility-ranges-are-well-formed.spec.ts)

##### A companion compatibility range names the same ecosystem as its package identity

- Requirement: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Owner: `extension-model`
- Statement: A companion declaration that carries a compatibility range shall be accepted only when the range names the same package ecosystem as the package identity, and a mismatched pair shall be refused with guidance naming both ecosystems.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`packages/core/extension-model/src/unstable/package-urls/compatibility-ranges-match-the-package-ecosystem.spec.ts`](../packages/core/extension-model/src/unstable/package-urls/compatibility-ranges-match-the-package-ecosystem.spec.ts)

### Goal: extension-adoption

People and agents can find, install, update, and remove reusable extensions across coding agents through dependable product surfaces.

#### Functional

##### The environment selects the built-in extension source

- Requirement: `cli/environment-selects-built-in-extension-source`
- Owner: `cli-e2e`
- Statement: For extension resolution through the built-in AgentXM source, AXM shall use a non-empty AXM_REGISTRY_LOCATION before the selected Registry service URL while preserving a file source independently from HTTP services.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Fresh built CLI invocations resolve and acquire distinct package bytes from real file Registries and a controlled HTTP origin, so an environment value merely parsed but ignored cannot satisfy the cases.
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli/src/runtime.test.ts`
- Source: [`apps/cli-e2e/src/environment-selects-built-in-extension-source.spec.ts`](../apps/cli-e2e/src/environment-selects-built-in-extension-source.spec.ts)

##### Product activity events represent usable outcomes

- Requirement: `cli/telemetry/product-activity-events-represent-usable-outcomes`
- Owner: `cli`
- Statement: When an operator opts in to usage telemetry, an eligible applied product activity shall emit one linked start and finish lifecycle, shall mark activation only after a real usable install or enabling configuration changed durable state, shall exclude preview, no-op, cancellation, failure, and publication from consumer activation, and shall not let a retry reset the cohort boundary.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table, example
- Derived from: `system/security/telemetry-consent-and-precedence`
- Source: [`apps/cli/src/cli-runtime/product-activity-telemetry.spec.ts`](../apps/cli/src/cli-runtime/product-activity-telemetry.spec.ts)

##### View can return one selected metadata field

- Requirement: `cli/view/returns-the-selected-field`
- Owner: `cli`
- Statement: When a caller selects a supported extension metadata field, AXM shall return that field's bare value alone in its machine result; when the selected field is not a reportable field, or the extension carries no value for it, AXM shall refuse the request without emitting a successful result.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/src/root/view/handler.ts`, `cli/view/reports-missing-targets-and-fields`
- Source: [`apps/cli/src/root/view/returns-the-selected-field.spec.ts`](../apps/cli/src/root/view/returns-the-selected-field.spec.ts)

##### A canonical extension name always parses back to the identity that produced it

- Requirement: `extension-identity/canonical-names-round-trip`
- Owner: `extension-model`
- Statement: A fully qualified name or owner handle produced from an extension identity shall parse back to exactly that identity.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`packages/core/extension-model/src/unstable/extensions/canonical-names-round-trip.spec.ts`](../packages/core/extension-model/src/unstable/extensions/canonical-names-round-trip.spec.ts)

##### Owner input that differs only by whitespace or letter case normalizes to the canonical handle

- Requirement: `extension-identity/owner-input-normalizes-to-the-canonical-handle`
- Owner: `extension-model`
- Statement: Owner input that differs from a canonical owner handle only by surrounding whitespace or letter case shall normalize to that canonical lower-case handle.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: property, example
- Derived from: `extension-identity/canonical-names-round-trip`
- Source: [`packages/core/extension-model/src/unstable/extensions/owner-input-normalizes-to-the-canonical-handle.spec.ts`](../packages/core/extension-model/src/unstable/extensions/owner-input-normalizes-to-the-canonical-handle.spec.ts)

##### An extension reference is a fully qualified name with an optional version constraint

- Requirement: `extension-identity/references-are-a-name-with-an-optional-constraint`
- Owner: `extension-model`
- Statement: An extension reference shall identify exactly the extension its fully qualified name identifies regardless of any appended version constraint, and a reference whose appended constraint is not a valid version constraint shall be rejected with guidance naming the version constraint.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property, example
- Derived from: `extension-identity/canonical-names-round-trip`, `extension-identity/malformed-names-are-rejected`
- Source: [`packages/core/extension-model/src/unstable/extensions/references-are-a-name-with-an-optional-constraint.spec.ts`](../packages/core/extension-model/src/unstable/extensions/references-are-a-name-with-an-optional-constraint.spec.ts)

##### Source locators resolve through a stable grammar and configured hosts

- Requirement: `source-resolution/locator-grammar-is-stable`
- Owner: `extension-sources`
- Statement: A source locator shall resolve through the published grammar to exactly the coordinates it names, a project-defined source shall override a built-in host of the same name, and a locator outside the grammar shall be refused with a typed failure that explains the rejection.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Assumptions: The workspace presents its configured sources ahead of the built-in hosts, which is what the workspace settings reader's three-layer merge (project, then user, then built-in) produces.
- Limitation: The override example shows that resolution selects the configured entry when a project source and the built-in host of the same name are both presented. That the workspace puts the project entry first — the name-based merge of project, user, and built-in sources — is workspace-state's settings reader, which a domain:supporting package may not depend on; its own merge-ordering tests assert it. Retires when: Source resolution can observe a workspace-assembled catalog from this package — for example, workspace-state publishes catalog assembly through a port a supporting package may depend on.
- Additional evidence: process via [`apps/cli-e2e/src/http-registry.e2e.test.ts`](../apps/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`packages/supporting/extension-sources/src/locator-grammar-is-stable.spec.ts`](../packages/supporting/extension-sources/src/locator-grammar-is-stable.spec.ts)

##### Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable

- Requirement: `version-constraints/constraint-intersection-preserves-every-limit`
- Owner: `extension-model`
- Statement: When version constraints from several contributors are combined, the combined constraint shall accept a version exactly when every contributor accepts it, and a combination that no version satisfies or that includes an invalid contributor shall be reported as unsatisfiable.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`packages/core/extension-model/src/unstable/version-constraints/constraint-intersection-preserves-every-limit.spec.ts`](../packages/core/extension-model/src/unstable/version-constraints/constraint-intersection-preserves-every-limit.spec.ts)

##### A version constraint accepts exactly the versions its semver range allows

- Requirement: `version-constraints/range-satisfaction-follows-semver`
- Owner: `extension-model`
- Statement: A version constraint shall be accepted only as a valid semver range and shall match a version exactly when semver allows it, and an exact version shall be accepted only in strict semver form with no leading v, missing part, or leading zero.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, decision-table, example
- Source: [`packages/core/extension-model/src/unstable/version-constraints/range-satisfaction-follows-semver.spec.ts`](../packages/core/extension-model/src/unstable/version-constraints/range-satisfaction-follows-semver.spec.ts)

### Goal: knowledge-access

People and agents can discover concepts, commands, and contracts from the surface they are already using.

#### Functional

##### Query and search accept the published result limits

- Requirement: `cli/knowledge/concepts/enforces-published-result-limits`
- Owner: `knowledge-query`
- Statement: When a Knowledge query or search selects a result limit, AXM shall accept only whole-number limits from 1 through 100 and return no more than that many concepts on a page.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/knowledge.md`, `packages/core/knowledge-query/src/query/request.ts`
- Source: [`packages/core/knowledge-query/src/query/enforces-published-result-limits.spec.ts`](../packages/core/knowledge-query/src/query/enforces-published-result-limits.spec.ts)

##### Get preserves source content and revision identity

- Requirement: `cli/knowledge/concepts/get/returns-source-backed-document`
- Owner: `knowledge-query`
- Statement: When retrieving an installed Knowledge concept, AXM shall return its complete frontmatter and body with source-backed bundle, content, and projection revision identity, including the exact source document when raw output is requested.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/help/topics/knowledge.md`, `apps/cli-e2e/src/knowledge.e2e.test.ts`, `packages/core/knowledge-query/src/knowledge-index.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/get/returns-source-backed-document.spec.ts`](../packages/core/knowledge-query/src/get/returns-source-backed-document.spec.ts)

##### Query passage bounds follow the published discovery limits

- Requirement: `cli/knowledge/concepts/query/enforces-published-query-bounds`
- Owner: `knowledge-query`
- Statement: When a Knowledge query selects passage bounds, AXM shall accept only whole-number passage limits from 0 through 10 and passage lengths from 1 through 2000.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/knowledge-query/src/knowledge-capabilities.ts`, `apps/cli/help/topics/knowledge.md`
- Source: [`packages/core/knowledge-query/src/query/enforces-published-query-bounds.spec.ts`](../packages/core/knowledge-query/src/query/enforces-published-query-bounds.spec.ts)

##### Related traversal validates its depth limit

- Requirement: `cli/knowledge/concepts/related/enforces-published-depth-bounds`
- Owner: `knowledge-query`
- Statement: When a caller selects a Knowledge relationship traversal depth, AXM shall accept only whole-number depths from one through three.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/knowledge-query/src/knowledge-capabilities.ts`, `apps/cli/src/root/knowledge/concepts/related.ts`
- Source: [`packages/core/knowledge-query/src/graph/enforces-published-depth-bounds.spec.ts`](../packages/core/knowledge-query/src/graph/enforces-published-depth-bounds.spec.ts)

##### Discovery status describes the supported query contract

- Requirement: `cli/knowledge/concepts/status/publishes-discovery-capabilities`
- Owner: `knowledge-query`
- Statement: When reporting Knowledge discovery capabilities, AXM shall identify its query grammar, supported operations and fields, output contract, cursor validity, and output limits consistently with the discovery commands.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/knowledge-query/src/knowledge-capabilities.ts`, `apps/cli/help/topics/knowledge.md`
- Additional evidence: process via [`apps/cli-e2e/src/knowledge.e2e.test.ts`](../apps/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`packages/core/knowledge-query/src/capabilities/publishes-discovery-capabilities.spec.ts`](../packages/core/knowledge-query/src/capabilities/publishes-discovery-capabilities.spec.ts)

### Goal: machine-automation

Machine consumers can drive AgentXM surfaces non-interactively with complete, schema-backed results separated from diagnostics.

#### Functional

##### ASCII display controls leave machine documents unchanged

- Requirement: `cli/ascii-controls-preserve-machine-output`
- Owner: `cli-e2e`
- Statement: When JSON output is selected, AXM shall leave result and diagnostic documents unchanged by AXM_ASCII, TERM, LC_ALL, LC_CTYPE, and LANG display-symbol inputs.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI receives the actual environment inputs while producing a successful help-topic result and a Unicode-bearing help refusal on its real machine channels.
- Methods: decision-table, example
- Derived from: `apps/cli/help/topics/environment.md`
- Limitation: These examples compare one successful result and one expected failure; they do not claim every command, lifecycle-progress event, or runtime formatter is covered. Retires when: Add a distinct command or event example when source review identifies a display-symbol input reaching an uncovered machine producer.
- Source: [`apps/cli-e2e/src/ascii-controls-preserve-machine-output.spec.ts`](../apps/cli-e2e/src/ascii-controls-preserve-machine-output.spec.ts)

##### The environment can disable the startup update check

- Requirement: `cli/environment-disables-startup-update-check`
- Owner: `cli-update`
- Statement: When AXM_NO_UPDATE_CHECK is 1, AXM shall omit the informational startup update notification and its release requests regardless of output or interaction mode, while allowing an explicitly invoked command to perform its required network operations.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Open questions: Must agent sessions always skip startup checks when AXM_NO_UPDATE_CHECK is not 1? Earlier environment help said they skip, but the current runtime and its internal test permit agent checks even without a TTY.; Does suppression also prohibit reading an existing update cache, beyond the absence of requests and notifications promised here?
- Limitation: The primary decision table uses a populated fresh cache and a controlled HTTP port; it establishes notification suppression and command-network independence, but does not by itself establish the absence of a background refresh when a cache is missing or stale. Retires when: Add a scheduler-coordinated missing/stale-cache control that observes the live startup wrapper's detached request and completion without wall-clock sleeps or leaked fibers.
- Source: [`packages/core/cli-update/src/startup-check/environment-disables-startup-update-check.spec.ts`](../packages/core/cli-update/src/startup-check/environment-disables-startup-update-check.spec.ts)

##### Registry services use the selected environment origin

- Requirement: `cli/environment-selects-registry-services`
- Owner: `cli`
- Statement: AXM shall use an HTTP(S) AXM_REGISTRY_LOCATION as its Registry service and authentication target, retain file-source selection independently, and reject an explicitly different AXM_REGISTRY_URL origin before a Registry request.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `extension-adoption`
- Boundary: memory; selection: per-change
- Boundary rationale: The composition root decodes the environment and builds the Registry and authentication targets; composing it over a controlled HTTP transport shows the selected origin reaching the request without contacting a real Registry. The built-CLI rows are bound evidence at apps/cli-e2e/src/registry-service-origin.e2e.test.ts.
- Methods: example, decision-table
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli/src/runtime.ts`, `apps/cli-e2e/src/registry-service-origin.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/registry-service-origin.e2e.test.ts`](../apps/cli-e2e/src/registry-service-origin.e2e.test.ts) — Only a real invocation against a real HTTP origin shows the selected service reaching the wire, and shows a conflicting selector refused before any request leaves the process.
- Source: [`apps/cli/src/environment-selects-registry-services.spec.ts`](../apps/cli/src/environment-selects-registry-services.spec.ts)

##### The published exit-code reference matches the runtime exit codes

- Requirement: `cli/exit-codes-match-published-reference`
- Owner: `cli`
- Statement: The served exit-codes help topic shall list exactly the exit codes and meanings the command line returns at runtime, with no missing, extra, or differing rows, and an invocation the parser rejects or an apply stopped as approval required shall exit with the code whose published meaning names that outcome.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model, example
- Source: [`apps/cli/src/cli-runtime/exit-codes-match-published-reference.spec.ts`](../apps/cli/src/cli-runtime/exit-codes-match-published-reference.spec.ts)

##### Schema topics expose the published JSON schema

- Requirement: `cli/help/schema-topics-return-json`
- Owner: `cli-e2e`
- Statement: When a schema help topic is requested, AXM shall return the published schema as parseable JSON, directly in ordinary output and in the topic content field in machine output.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Actual CLI output is decoded and compared with the published schema artifacts, detecting Markdown wrapping or unrelated schema content.
- Methods: contract, decision-table
- Derived from: `apps/cli/help/README.md`, `apps/cli/src/root/help/command.test.ts`
- Source: [`apps/cli-e2e/src/help/schema-topics-return-json.spec.ts`](../apps/cli-e2e/src/help/schema-topics-return-json.spec.ts)

##### Machine install output is one complete schema-backed plan document

- Requirement: `cli/install/machine-result-is-schema-backed`
- Owner: `cli`
- Statement: When the install command runs in machine output mode, it shall emit a single result document that satisfies the published plan-result schema and accounts for every unit exactly once in its counts, and preview shall report through that same contract with a previewed outcome.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`apps/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts`](../apps/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts) — Observes the real process stdout document and stderr diagnostics of the shipped CLI, which the in-memory renderer capture cannot prove.
- Source: [`apps/cli/src/root/install/machine-result-is-schema-backed.spec.ts`](../apps/cli/src/root/install/machine-result-is-schema-backed.spec.ts)

##### Every supported lint rule has a stable default and input scope

- Requirement: `cli/lint/catalog-is-complete`
- Owner: `workspace-lint`
- Statement: The lint rule catalog shall expose exactly the accepted rule identities, and each rule shall declare its accepted default severity and the filesystem views (workspace, git-index) it observes.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Boundary rationale: Rule identity, default severity, and input scope are properties of the composed catalog itself; reading them needs nothing but the catalog.
- Methods: contract, decision-table
- Derived from: `packages/core/workspace-lint/src/catalog/catalog-metadata.test.ts`, `packages/core/workspace-state/src/settings/generated-schema.test.ts`
- Source: [`packages/core/workspace-lint/src/catalog/catalog-is-complete.spec.ts`](../packages/core/workspace-lint/src/catalog/catalog-is-complete.spec.ts)

##### The machine lint result names the official skill's compatibility reason and recovery

- Requirement: `cli/lint/compatibility-result-names-reason-and-recovery`
- Owner: `workspace-lint`
- Statement: When lint runs in machine output mode, the result shall carry a compatibility result only when the workspace declares the official AXM skill, and that result shall name the reason the skill is incompatible and the recovery action with its next command, or no action when the skill is compatible.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The compatibility block is a field of the feature's own machine document, decided from the workspace's declaration and canonical package; the envelope that carries it is the CLI's concern, not this rule's.
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Open questions: The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.
- Source: [`packages/core/workspace-lint/src/catalog/workspace/compatibility-result-names-reason-and-recovery.spec.ts`](../packages/core/workspace-lint/src/catalog/workspace/compatibility-result-names-reason-and-recovery.spec.ts)

##### Machine lint output carries facts and no advice

- Requirement: `cli/lint/machine-findings-carry-only-facts`
- Owner: `cli`
- Statement: When lint runs in machine output mode, each reported finding shall carry only fact fields, and the run shall emit no advisory or suggestion content on any channel.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Boundary rationale: Machine output mode and its channels are adapter concepts, so the lint adapter over a captured Screen is the lowest layer that exercises both clauses; no process is needed to observe what it emitted.
- Methods: contract
- Derived from: `cli/lint/findings-name-the-violated-invariant`
- Source: [`apps/cli/src/root/lint/machine-findings-carry-only-facts.spec.ts`](../apps/cli/src/root/lint/machine-findings-carry-only-facts.spec.ts)

##### A plan-family operation publishes its lifecycle as typed events

- Requirement: `cli/long-running-operations-emit-lifecycle-events`
- Owner: `workspace-operations`
- Statement: A plan-family operation shall publish an operation-started event, a phase-started event for each phase it enters, a unit-started and a unit-resolved event for every unit it attempts, and exactly one settled event whose outcome equals the outcome of its result document.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The lifecycle is published by the operation itself; the transport that encodes it for automation is owned separately by cli/machine-progress-events-follow-the-lifecycle-schema.
- Methods: contract, example
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Source: [`packages/core/workspace-operations/src/plan/long-running-operations-emit-lifecycle-events.spec.ts`](../packages/core/workspace-operations/src/plan/long-running-operations-emit-lifecycle-events.spec.ts)

##### A failed machine invocation still emits the stable error envelope

- Requirement: `cli/machine-errors-use-the-stable-envelope`
- Owner: `cli`
- Statement: When a machine-output invocation fails, it shall exit non-zero and write exactly one schema-valid error document to standard output that carries any structured problem the failure names, keeping every diagnostic line on standard error as a structured event; when it stops as approval required, it shall write exactly one schema-valid result document that names the block and its recovery.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Derived from: `cli/lockfile-version-errors-expose-structured-problem`
- Additional evidence: process via [`apps/cli-e2e/src/smoke.e2e.test.ts`](../apps/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Additional evidence: process via [`apps/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../apps/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Source: [`apps/cli/src/cli-runtime/machine-errors-use-the-stable-envelope.spec.ts`](../apps/cli/src/cli-runtime/machine-errors-use-the-stable-envelope.spec.ts)

##### Machine output reports missing input or approval without prompting

- Requirement: `cli/machine-mode-never-prompts`
- Owner: `cli`
- Statement: When machine output mode is on, a command that cannot proceed without interactive input or approval shall stop without prompting, identify what it needs, and change no workspace state even from an interactive terminal, while with machine output off and an interactive prompt available the same request shall prompt and honor the answer.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Limitation: The skill-selection prompt has no in-memory interaction port, so the evidence that the same request prompts and honors the answer when machine output is off is carried by the setup command only. Retires when: An in-memory interaction port for the skill-selection prompt lets the harness record that prompt and its answer for install.
- Source: [`apps/cli/src/cli-runtime/machine-mode-never-prompts.spec.ts`](../apps/cli/src/cli-runtime/machine-mode-never-prompts.spec.ts)

##### Machine progress events are the published lifecycle events, in order, before the result

- Requirement: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Owner: `cli`
- Statement: When machine output mode is on and progress is enabled, every progress event written to standard error shall decode as one lifecycle event of the published schema whose sequence number strictly increases within its operation, and the operation shall write exactly one settled event before its result document.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `cli/machine-errors-use-the-stable-envelope`
- Source: [`apps/cli/src/screen/machine-progress-events-follow-the-lifecycle-schema.spec.ts`](../apps/cli/src/screen/machine-progress-events-follow-the-lifecycle-schema.spec.ts)

##### A stream that is not a terminal receives plain, unbounded human output

- Requirement: `cli/non-tty-output-is-plain-and-unpadded`
- Owner: `cli`
- Statement: When a standard stream receiving human output is not a terminal, AXM shall write no ANSI escape sequence to it and shall not wrap, truncate, or pad any line to a terminal width.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Open questions: When a stream is a capable terminal, should CI prohibit styling even when FORCE_COLOR explicitly requests it? Earlier environment help described unconditional plain CI output, while the resolver permits that terminal override; this requirement governs pipes and does not decide terminal precedence.
- Source: [`apps/cli/src/screen/non-tty-output-is-plain-and-unpadded.spec.ts`](../apps/cli/src/screen/non-tty-output-is-plain-and-unpadded.spec.ts)

##### Assessment is spelled --preview everywhere it exists and nowhere else

- Requirement: `cli/preview-uses-the-canonical-flag`
- Owner: `cli`
- Statement: Every command that assesses its change without applying it shall accept --preview and no alternative spelling, every command without an assessment shall reject --preview, every command that offers preapproval shall accept --yes while every command without one shall reject it, and rendered help shall list --preview and --yes on exactly the commands whose capabilities declare them.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Derived from: `cli/command-help-is-complete`
- Source: [`apps/cli/src/root/shared/preview-uses-the-canonical-flag.spec.ts`](../apps/cli/src/root/shared/preview-uses-the-canonical-flag.spec.ts)

##### Quiet machine output preserves results and diagnostics

- Requirement: `cli/quiet-preserves-machine-diagnostics`
- Owner: `cli`
- Statement: When quiet mode is used with machine output, AXM shall suppress progress events while preserving result documents and non-progress diagnostic events.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: The production machine screen over recording output streams is where progress suppression and diagnostic preservation are decided; the built-CLI rows over real result and diagnostic streams are bound evidence at apps/cli-e2e/src/quiet-machine-output.e2e.test.ts.
- Methods: decision-table, example
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`, `apps/cli/help/topics/machine-output.md`, `apps/cli/src/screen/screen-machine.test.ts`, `apps/cli-e2e/src/quiet-machine-output.e2e.test.ts`
- Additional evidence: process via [`apps/cli-e2e/src/quiet-machine-output.e2e.test.ts`](../apps/cli-e2e/src/quiet-machine-output.e2e.test.ts) — Only a real invocation shows the quiet flag spellings reaching the machine screen and the result and diagnostic streams a caller actually reads.
- Source: [`apps/cli/src/screen/quiet-preserves-machine-diagnostics.spec.ts`](../apps/cli/src/screen/quiet-preserves-machine-diagnostics.spec.ts)

##### Token output exposes the effective credential on request

- Requirement: `cli/token/returns-effective-token`
- Owner: `cli`
- Statement: When a credential is available, axm token shall return that credential alone as text by default or as a structured token value when JSON output is requested.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/auth/token.ts`
- Additional evidence: process via [`apps/cli-e2e/src/auth.e2e.test.ts`](../apps/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`apps/cli/src/root/auth/token-returns-effective-token.spec.ts`](../apps/cli/src/root/auth/token-returns-effective-token.spec.ts)

##### Machine upgrade emits one complete assessment

- Requirement: `cli/upgrade/machine-result-is-upgrade-assessment`
- Owner: `cli`
- Statement: When upgrade reports an assessment in machine mode, AXM shall emit exactly one axm.upgrade-assessment/v1 result that separately records intent, platform, ownership, canonical selection, installer availability, target, mutation, verification, recovery, command evidence, and disposition.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Source: [`apps/cli/src/root/upgrade/machine-result-is-upgrade-assessment.spec.ts`](../apps/cli/src/root/upgrade/machine-result-is-upgrade-assessment.spec.ts)

##### Version output identifies the running release

- Requirement: `cli/version-output-identifies-running-release`
- Owner: `cli-e2e`
- Statement: When the version flag is requested, AXM shall report the running CLI release version, using a structured version document when machine output is selected.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI process must report its package release identity through the actual global formatter in both human and machine modes.
- Methods: contract, example
- Derived from: `apps/cli/help/topics/machine-output.md`, `apps/cli-e2e/src/smoke.e2e.test.ts`, `apps/cli-e2e/src/binary-smoke.e2e.test.ts`
- Limitation: These examples exercise the built JavaScript entrypoint through Bun. Compiled and externally installed release identities require evidence for those exact artifacts. Retires when: Bind exact version readback to identified compiled and installed release artifacts.
- Source: [`apps/cli-e2e/src/version-output-identifies-running-release.spec.ts`](../apps/cli-e2e/src/version-output-identifies-running-release.spec.ts)

##### Machine version output identifies the manifest and before and after versions

- Requirement: `cli/version/machine-result-identifies-manifest-change`
- Owner: `cli`
- Statement: When a version change runs in machine mode, AXM shall emit one plan-result document identifying the selected extension, manifest path, previous and resulting versions, and whether a change was applied or unnecessary.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `apps/cli/src/root/version/command.ts`, `packages/core/extension-authoring/src/version/change-authored-version.ts`
- Open questions: Whether the version machine result stays a plan-result document once the authoring use case returns a version-specific typed outcome is undecided; if it is replaced, the units and counts assertions here must be re-accepted.
- Source: [`apps/cli/src/root/version/machine-result-identifies-manifest-change.spec.ts`](../apps/cli/src/root/version/machine-result-identifies-manifest-change.spec.ts)

##### The published lockfile schema describes what the product accepts

- Requirement: `settings-contract/published-lockfile-schema-agrees-with-accepted-input`
- Owner: `cli`
- Statement: The published lockfile schema shall admit exactly the lockfile version and required fields the product accepts, and a lockfile at any other version or missing a required field shall be refused.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`
- Supersedes: `settings-contract/published-schemas-agree-with-accepted-input`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`apps/cli/src/published-schemas/published-lockfile-schema-agrees-with-accepted-input.spec.ts`](../apps/cli/src/published-schemas/published-lockfile-schema-agrees-with-accepted-input.spec.ts)

##### The published settings schema describes what the product accepts

- Requirement: `settings-contract/published-settings-schema-agrees-with-accepted-input`
- Owner: `cli`
- Statement: The published settings schema shall agree with the product on every example document, lint rule identity, and severity value it admits, shall not admit an unregistered rule, wildcard rule, or misspelled severity, and shall declare agent selection on the workspace settings document alone, admitting no per-entry agent subset.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`
- Supersedes: `settings-contract/published-schemas-agree-with-accepted-input`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`apps/cli/src/published-schemas/published-settings-schema-agrees-with-accepted-input.spec.ts`](../apps/cli/src/published-schemas/published-settings-schema-agrees-with-accepted-input.spec.ts)

### Goal: platform-reach

AXM works on every supported operating system, runtime, shell, and filesystem.

#### Functional

##### Public installers install the requested release version

- Requirement: `system/installability/native-installers-use-requested-version`
- Owner: `cli-e2e`
- Statement: When AXM_INSTALL_VERSION names an exact unprefixed major.minor.patch release without prerelease or build metadata, the public installers shall select that immutable release without stable-channel discovery and shall install only an executable reporting that version.
- Class: functional
- Role: interface
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: process; selection: per-change
- Boundary rationale: The actual public shell installer runs with a controlled downloader; exact and mutable release URLs return different checksum-valid executable bytes, and independent filesystem readback establishes which release was committed.
- Methods: example
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli/help/topics/upgrade.md`, `apps/cli/site-content/install.sh`, `apps/cli/site-content/install.ps1`
- Open questions: When AXM_INSTALL_VERSION is unset, does latest stable mean GitHub's latest release or the separately promoted AXM stable-channel document? Current public installers use GitHub latest; the accepted upgrade owner requires the promoted channel for axm upgrade.; What observable refusal and recovery must an invalid AXM_INSTALL_VERSION produce? The public source declares the supported value domain but does not state pre-request rejection, exact diagnostics, or preservation timing.; Are prerelease and build-metadata versions supported by the public installers? The stated unprefixed-semver domain is broader than the accepted exact-upgrade stable-version domain; do not import upgrade's restriction without a decision.
- Limitation: The direct cases run the shell installer on macOS/Linux. Existing PowerShell/cmd installed-product evidence verifies installation but does not discriminate immutable-version routing from latest routing; that missing URL-and-version control remains explicit. Retires when: Add the same selected-versus-newer transport control to the actual PowerShell installer and its cmd entrypoint on the supported Windows matrix.
- Source: [`apps/cli-e2e/src/installers/native-installers-use-requested-version.spec.ts`](../apps/cli-e2e/src/installers/native-installers-use-requested-version.spec.ts)

##### Native installers use the selected destination directory

- Requirement: `system/installability/native-installers-use-selected-directory`
- Owner: `cli-e2e`
- Statement: When AXM_INSTALL_DIR selects an absolute directory, AXM's bash, PowerShell, and cmd installers shall install the executable in that directory.
- Class: functional
- Role: interface
- Product goals: `platform-reach`
- Boundary: process; selection: per-change
- Boundary rationale: The primary example executes the actual shell installer against a local download fixture and observes the installed bytes; the existing installed-product suite binds real AXM execution for every supported installer shell.
- Methods: example
- Derived from: `apps/cli/help/topics/environment.md`, `apps/cli-e2e/src/install-verification.e2e.test.ts`
- Limitation: The primary macOS/Linux example installs a version-answering fixture and does not establish AXM startup or Windows installer behavior. Those observations remain in the bound real-binary installed suite and its Windows shell matrix. Retires when: Retain successful real AXM installation evidence for the selected directory on every supported installer shell and platform.
- Additional evidence: installed via [`apps/cli-e2e/src/install-verification.e2e.test.ts`](../apps/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Source: [`apps/cli-e2e/src/installers/native-installers-use-selected-directory.spec.ts`](../apps/cli-e2e/src/installers/native-installers-use-selected-directory.spec.ts)

### Goal: privacy-and-consent

Observation of product use stays within the documented data boundary and under the control of the person being observed.

#### Quality

##### Telemetry excludes extension content and secrets

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Owner: `cli`
- Statement: Every telemetry event and error report AXM sends shall conform to AgentXM Telemetry Ingest API 0.2.0 and contain only identity, timing, and command-observation data, excluding extension content, authored instructions and knowledge, credentials, and resolved secret values.
- Class: quality (privacy)
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Source: [`apps/cli/src/telemetry/telemetry-payloads-respect-data-boundary.spec.ts`](../apps/cli/src/telemetry/telemetry-payloads-respect-data-boundary.spec.ts)

##### Enabled telemetry uses anonymous random installation identity

- Requirement: `system/security/telemetry-uses-anonymous-installation-identity`
- Owner: `cli`
- Statement: When an operator enables telemetry, AXM shall use a persisted random installation identity rather than a machine-derived identity, mark usage events anonymous, assign each usage event a fresh retry-stable event identity, and create no telemetry identity while collection is disabled.
- Class: quality (privacy)
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`apps/cli/src/telemetry/telemetry-uses-anonymous-installation-identity.spec.ts`](../apps/cli/src/telemetry/telemetry-uses-anonymous-installation-identity.spec.ts)

### Goal: trustworthy-distribution

Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.

#### Functional

##### The publication archive matches its complete reported inventory

- Requirement: `cli/publish/archive-inventory-matches-published-bytes`
- Owner: `extension-publish`
- Statement: Publish shall include every regular package-root file unless explicitly ignored and report the effective included and excluded paths, byte sizes, matching patterns, pattern counts and warnings, total source and ZIP bytes, and SRI SHA-512 integrity that describe the archive it publishes.
- Class: functional
- Role: interface
- Product goals: `trustworthy-distribution`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `apps/cli/help/topics/publish.md`, `apps/cli/src/root/publish/command.test.ts`
- Source: [`packages/core/extension-publish/src/archive/archive-inventory-matches-published-bytes.spec.ts`](../packages/core/extension-publish/src/archive/archive-inventory-matches-published-bytes.spec.ts)

#### External conformance

##### Publication uploads are bound to the reviewed source and visibility

- Requirement: `cli/publish/uploads-the-reviewed-publication-set`
- Owner: `extension-publish`
- Statement: For a remotely authorized publication, AXM shall bind each actual archive upload to its reviewed publication-set-v2 candidate using the granted capability, condition, publication-set digest, descriptor digest, and resolved visibility, and report the Registry's acknowledged outcome.
- Class: external-conformance
- Role: interface
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `AgentXM Registry API 0.1.0`, `apps/cli/src/root/publish/command.test.ts`
- Open questions: If local source changes after publication review, must AXM abort and revoke unused grants, or may it upload the frozen reviewed archive? The current implementation aborts; the accepted requirement binds actual upload bytes to the reviewed set without choosing an enforcement strategy.
- Source: [`packages/core/extension-publish/src/authorization/uploads-the-reviewed-publication-set.spec.ts`](../packages/core/extension-publish/src/authorization/uploads-the-reviewed-publication-set.spec.ts)

### Goal: workspace-intent-fidelity

Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.

#### Functional

##### The selected application home contains user resources

- Requirement: `cli/environment-relocates-user-resources`
- Owner: `cli-e2e`
- Statement: When AXM_USER_HOME is non-empty, AXM shall use that home for its user workspace, restricted-file credentials, pending device login, install metadata, and default self-managed executable without falling back to the platform home for those resources.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Fresh CLI setup invocations establish relocated workspace placement; real credential, pending-login, and install-metadata services read and write disposable homes; the installer control establishes executable placement.
- Methods: example, decision-table
- Derived from: `apps/cli/help/topics/environment.md`, `packages/core/workspace-state/src/workspace/paths.test.ts`, `packages/supporting/registry-auth/src/credential-store.test.ts`, `packages/supporting/registry-auth/src/pending-device-login-store.test.ts`, `apps/cli/src/install-meta/install-meta.test.ts`, `apps/cli/src/environment-relocates-user-resources.test.ts`
- Open questions: What is the canonical restricted-file credential subdirectory? Earlier environment help named the .axm application home, while current storage uses .config/axm.; Should an empty AXM_USER_HOME use the platform home consistently for credentials and pending login as earlier environment help promised? Their current environment reader preserves an empty string.; Does AXM_USER_HOME also relocate platform-style caches? The cache resolver and its internal witness do so, while earlier environment help said platform caches keep platform locations.
- Limitation: The default executable example runs the actual shell installer only on macOS/Linux and uses a version-answering executable fixture. These examples supply no Windows process evidence for user-workspace, PowerShell/cmd default executable, or install-metadata relocation; direct live-adapter cases do not establish that process population. Retires when: Add equivalent populated platform-versus-application-home process controls for the supported Windows installer shells and built CLI, while retaining actual installed-binary evidence for product startup.
- Limitation: This owner concerns application resources, not the OS keychain. It does not claim that AXM_USER_HOME changes the logged-in operating-system account or keychain namespace. Retires when: Retain that ownership distinction while changes to the application-home implementation are reviewed.
- Source: [`apps/cli-e2e/src/environment-relocates-user-resources.spec.ts`](../apps/cli-e2e/src/environment-relocates-user-resources.spec.ts)

##### MCP entries declare exactly one of source, command, or url

- Requirement: `cli/mcps/entries-declare-exactly-one-transport`
- Owner: `workspace-state`
- Statement: An MCP server entry in axm.json shall declare exactly one of source, command, or url, and a document declaring none or more than one shall be refused with an error naming that rule.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Boundary rationale: Transport exclusivity is a property of the accepted settings document; the decode that refuses it is the lowest layer that decides the rule.
- Methods: decision-table
- Derived from: `cli/mcps/inline-authority-is-operation-coherent`, `cli/invalid-workspace-state-gates-operations`
- Supersedes: `cli/mcps/inline-authority-is-operation-coherent`
- Source: [`packages/core/workspace-state/src/settings/mcp-entries-declare-exactly-one-transport.spec.ts`](../packages/core/workspace-state/src/settings/mcp-entries-declare-exactly-one-transport.spec.ts)

##### Locally named MCP install requests are validated before any workspace change

- Requirement: `cli/mcps/install/local-name-requests-are-validated-before-any-change`
- Owner: `extension-lifecycle`
- Statement: When an MCP install names a local connection, AXM shall reject the request before any workspace change, with an error naming the violated rule, if the local name is invalid, the name is already owned by a different source, or the requested version constraint does not intersect the constraints the source's other origins already declare.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/mcps/install/local-connection-names-share-source-resolution`
- Source: [`packages/core/extension-lifecycle/src/mcps/install/local-name-requests-are-validated-before-any-change.spec.ts`](../packages/core/extension-lifecycle/src/mcps/install/local-name-requests-are-validated-before-any-change.spec.ts)

##### The machine MCP inventory distinguishes local connection identity from source resolution

- Requirement: `cli/mcps/list/local-name-source-and-resolution-are-distinct`
- Owner: `workspace-inspection`
- Statement: When MCP servers are listed in machine output, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields, so that connections sharing one source remain individually identifiable, and shall report every configured agent's outcome for the connection — naming an agent that cannot represent it as unsupported rather than omitting it.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/core/workspace-inspection/src/type-list/mcp-servers.ts`, `cli/mcps/projects-to-every-configured-agent`
- Source: [`packages/core/workspace-inspection/src/mcps/local-name-source-and-resolution-are-distinct.spec.ts`](../packages/core/workspace-inspection/src/mcps/local-name-source-and-resolution-are-distinct.spec.ts)

##### A sync check reports whether managed output needs updating

- Requirement: `cli/sync/check-reports-convergence`
- Owner: `cli-e2e`
- Statement: When sync --preview --fail-on-change can assess workspace reconciliation, AXM shall return exit status 0 with a no-op result when no reconciliation is needed and exit status 1 with divergence and the complete preview plan when changes are needed.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Separate invocations of the built CLI expose the exit status and machine result consumed by automation, including the distinction between an ordinary preview and a convergence check against the same persisted workspace.
- Methods: example
- Derived from: `cli/sync/preview-is-pure`, `apps/cli/src/root/sync/handler.test.ts`, `apps/cli/help/topics/workspace-state.md`
- Source: [`apps/cli-e2e/src/sync-check-reports-convergence.spec.ts`](../apps/cli-e2e/src/sync-check-reports-convergence.spec.ts)

##### Type inventories report local extension state

- Requirement: `cli/type-lists-report-local-state`
- Owner: `workspace-inspection`
- Statement: When listing skills, subagents, rules, hooks, or packs, AXM shall report the selected type’s current local entries with their management classification, installation state, and source observation, including configured entries that are disabled or absent.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/skills/list.test.ts`, `cli/list/reports-the-cross-type-inventory`, `packages/core/workspace-inspection/src/type-list/type-lists.ts`
- Additional evidence: process via [`apps/cli-e2e/src/skills.e2e.test.ts`](../apps/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`packages/core/workspace-inspection/src/type-lists-report-local-state.spec.ts`](../packages/core/workspace-inspection/src/type-lists-report-local-state.spec.ts)

##### Type inspection distinguishes source and observed version

- Requirement: `cli/type-shows-report-source-and-version`
- Owner: `workspace-inspection`
- Statement: When inspecting one configured skill, MCP server, subagent, rule, hook, or Knowledge bundle, AXM shall report its local identity, activation, source, and version from the accepted resolution, or from the matching authored manifest when no resolution exists.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `apps/cli/src/root/shared/extension-show.test.ts`, `packages/core/workspace-inspection/src/show/show-extension.ts`
- Source: [`packages/core/workspace-inspection/src/type-shows-report-source-and-version.spec.ts`](../packages/core/workspace-inspection/src/type-shows-report-source-and-version.spec.ts)

##### Visibility status supplies repository intent and reports the Registry evaluation

- Requirement: `cli/visibility/status/reports-repository-intent-and-registry-evaluation`
- Owner: `extension-publish`
- Statement: For a project-scoped visibility status request, AXM shall submit the manifest visibility intent when present, otherwise the workspace default when present, otherwise no intent, and report the selected extension's Registry evaluation through the AgentXM Registry API 0.1.0 contract.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Derived from: `apps/cli/src/root/visibility/handler.ts`, `packages/core/registry-protocol/src/unstable/publish/visibility.ts`
- Source: [`packages/core/extension-publish/src/visibility/status-reports-repository-intent-and-registry-evaluation.spec.ts`](../packages/core/extension-publish/src/visibility/status-reports-repository-intent-and-registry-evaluation.spec.ts)

##### A malformed extension name is rejected with a typed failure naming the input

- Requirement: `extension-identity/malformed-names-are-rejected`
- Owner: `extension-model`
- Statement: A reference that does not match the extension name grammar, including any bare name, shall be rejected with a typed failure that preserves the offending input.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Source: [`packages/core/extension-model/src/unstable/extensions/malformed-names-are-rejected.spec.ts`](../packages/core/extension-model/src/unstable/extensions/malformed-names-are-rejected.spec.ts)

##### An accepted settings document re-encodes exactly as it was authored

- Requirement: `settings-contract/accepted-settings-round-trip-losslessly`
- Owner: `workspace-state`
- Statement: A settings document the product accepts shall re-encode to exactly the authored document, including entries in object form and content the product does not recognize.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `settings-contract/saving-settings-preserves-authored-formatting`
- Source: [`packages/core/workspace-state/src/settings/accepted-settings-round-trip-losslessly.spec.ts`](../packages/core/workspace-state/src/settings/accepted-settings-round-trip-losslessly.spec.ts)

##### Workspace settings select agents only through the workspace agent list

- Requirement: `settings-contract/agent-membership-is-the-only-agent-selection`
- Owner: `workspace-state`
- Statement: Workspace settings shall express agent selection only through the workspace agent list, and shall reject an extension entry that declares its own agent subset with an error naming that key.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `settings-contract/published-settings-schema-agrees-with-accepted-input`, `cli/settings-validity-gates-operations`
- Assumptions: The product reads settings with excess keys treated as errors, so decoding here with the same option observes the product's acceptance boundary.
- Source: [`packages/core/workspace-state/src/settings/agent-membership-is-the-only-agent-selection.spec.ts`](../packages/core/workspace-state/src/settings/agent-membership-is-the-only-agent-selection.spec.ts)

##### Saving settings preserves authored formatting, ordering, and unrecognized content

- Requirement: `settings-contract/saving-settings-preserves-authored-formatting`
- Owner: `workspace-state`
- Statement: When the product saves settings back to axm.json, it shall preserve the authored indentation, key order, and unrecognized content, and rewriting unchanged settings shall leave the file byte-identical.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: golden-output, example
- Source: [`packages/core/workspace-state/src/settings/saving-settings-preserves-authored-formatting.spec.ts`](../packages/core/workspace-state/src/settings/saving-settings-preserves-authored-formatting.spec.ts)

## Supporting system behavior

### Goal: dependable-change-process

Changes and releases land through the governed repository process with required evidence and human approval.

#### Constraints

##### The public system depends on private platform responsibilities only through published contracts

- Requirement: `system/architecture/public-system-depends-only-on-published-contracts`
- Owner: `axm`
- Statement: The public AXM system shall depend on private platform responsibilities only through published packages and through clients generated from contract documents tracked in this repository, and no workspace package shall reference a private package or a filesystem path outside the repository.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests, the tracked contract documents, and the tracked generated clients show what the public system actually depends on.
- Methods: contract
- Source: [`scripts/public-system-depends-only-on-published-contracts.spec.ts`](../scripts/public-system-depends-only-on-published-contracts.spec.ts)

#### Process

##### End-to-end suites reach the product only as a shipped artifact, never as imported code

- Requirement: `system/architecture/e2e-observes-only-shipped-artifacts`
- Owner: `cli-e2e`
- Statement: End-to-end test projects shall exercise AXM only through its shipped artifacts and shall not declare a dependency on, or a project reference to, any product source package.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and TypeScript project references of the end-to-end projects show whether they reach product source directly.
- Methods: contract
- Assumptions: The module-boundary lint gate declared as bound evidence runs on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects workspace imports from end-to-end and test-support projects into product source packages, and relative imports that cross a project root, leaving the built CLI output path as the only sanctioned way to reach the shipped surface.
- Source: [`apps/cli-e2e/src/e2e-observes-only-shipped-artifacts.spec.ts`](../apps/cli-e2e/src/e2e-observes-only-shipped-artifacts.spec.ts)

##### Pre-launch contract changes land as one coherent break without compatibility paths

- Requirement: `system/process/pre-launch-changes-stay-coherent`
- Owner: `axm`
- Statement: Until public launch, a contract change shall land as one coherent break that updates every affected producer, consumer, test, fixture, and document together, and shall not add compatibility shims, aliases, dual paths, or deprecation windows.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The obligation is review-enforced; the repository supplies its declaration in the committed agent instructions from which every change is directed.
- Methods: contract
- Assumptions: Human and agent reviewers enforce the clean-break policy on each change; the evidence establishes only that the policy is declared.
- Limitation: The obligation is time-boxed to the pre-launch period and its evidence establishes only that the clean-break policy is declared in the committed agent instructions; it cannot observe whether an individual change honored the policy. Retires when: Public launch of AXM, when backward compatibility returns to scope and this obligation is retired or superseded by the launch compatibility policy in the same change.
- Source: [`scripts/pre-launch-changes-stay-coherent.spec.ts`](../scripts/pre-launch-changes-stay-coherent.spec.ts)

##### Repository-authored tracked content references no private coordination context

- Requirement: `system/process/public-artifacts-protect-private-context`
- Owner: `axm`
- Statement: Repository-authored tracked text content in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the tracked file set reported by git and the committed text content can show whether public artifacts reference private context.
- Methods: contract
- Assumptions: Installed extension content under agent_extensions/ is published extension content that AXM manages and the Registry governs, not a repository-authored artifact; the obligation and its scan cover repository-authored content only.
- Source: [`scripts/public-artifacts-protect-private-context.spec.ts`](../scripts/public-artifacts-protect-private-context.spec.ts)

##### Release preparation validates production Registry gates without distribution

- Requirement: `system/process/release-preparation-validates-production-gates`
- Owner: `axm`
- Statement: Release preparation shall preflight the production Registry before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: The orchestrations accept an injected host, so the ordering of the production Registry preflight against candidate allocation, and the preview-only shape of the exact-candidate validation, are observable in the repository without contacting the production Registry.
- Methods: example, contract
- Assumptions: A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.
- Bound evidence: `test: axm:test (scripts/release-prepare.test.ts)` — Drives the release-preparation entry point against a fake host and checks that it allocates a disposable detached worktree installed with a frozen lockfile, and cleans it up on every failure.
- Bound evidence: `test: axm:test (scripts/repository-task-interface.test.ts)` — Checks that the release-preparation and candidate targets never replay a cached result, so neither the production preflight nor the exact preview can be skipped.
- Source: [`scripts/release-preparation-validates-production-gates.spec.ts`](../scripts/release-preparation-validates-production-gates.spec.ts)

##### One automated workflow publishes releases

- Requirement: `system/process/releases-publish-through-canonical-workflow`
- Owner: `axm`
- Statement: Release artifacts shall be published only by the canonical publish.yml workflow, triggered by a published release or an explicit release tag and validating release assets before completion, and no other workflow shall publish release artifacts.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed workflow files show which workflow publishes releases, what triggers it, and that no other workflow does.
- Methods: contract
- Assumptions: Publishing credentials are available only to the canonical workflow, so no manual or external path can publish release artifacts.
- Source: [`scripts/releases-publish-through-canonical-workflow.spec.ts`](../scripts/releases-publish-through-canonical-workflow.spec.ts)

### Goal: platform-reach

AXM works on every supported operating system, runtime, shell, and filesystem.

#### Quality

##### Every supported platform and shell receives release-blocking verification

- Requirement: `system/compatibility/supported-platform-matrix`
- Owner: `cli-e2e`
- Statement: Every supported operating system and architecture shall receive release-blocking verification of the compiled binary, every supported installer shell shall receive release-blocking verification of the installed product, and Windows workspace behavior shall be verified on a real Windows runner.
- Class: quality (compatibility)
- Role: supporting
- Product goals: `platform-reach`
- Boundary: repository; selection: platform-matrix
- Boundary rationale: The committed ci.yml and publish.yml workflow files are read only as a coverage check showing which supported platforms, shells, and runners the bound matrix jobs cover; the compatibility evidence itself comes from the binary, platform, and installed executions those jobs run on each platform.
- Methods: contract
- Derived from: `system/installability/product-installs-through-supported-channels`
- Assumptions: A job named in the workflow files blocks its merge or release rather than running as an advisory check.
- Bound evidence: `ci: binary-smoke` — Runs the compiled-binary smoke execution on every supported operating system and architecture for every change that reaches the main branch, producing the binaries a release attaches.
- Bound evidence: `ci: windows-workspace` — Runs the Windows workspace mutation execution on a real Windows runner for every change.
- Bound evidence: `publish: install-verify` — Runs the installer verification execution against the real release assets on every supported installer shell before the release workflow completes.
- Additional evidence: binary via [`apps/cli-e2e/src/binary-smoke.e2e.test.ts`](../apps/cli-e2e/src/binary-smoke.e2e.test.ts) — Executes the compiled platform binary, proving the shipped artifact starts and answers on the target operating system and architecture.
- Additional evidence: installed via [`apps/cli-e2e/src/install-verification.e2e.test.ts`](../apps/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Additional evidence: platform via [`apps/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts`](../apps/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts) — Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.
- Source: [`apps/cli-e2e/src/supported-platform-matrix.spec.ts`](../apps/cli-e2e/src/supported-platform-matrix.spec.ts)

### Goal: trustworthy-distribution

Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.

#### Constraints

##### Upgrade establishes ownership before release selection

- Requirement: `cli/upgrade/ownership-precedes-release-selection`
- Owner: `cli-update`
- Statement: Upgrade shall identify the installation owner before performing canonical release selection so unresolved ownership fails without an unnecessary release-authority request and every later availability and mutation decision is installer-specific.
- Class: constraint
- Role: supporting
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`packages/core/cli-update/src/upgrade/ownership-precedes-release-selection.spec.ts`](../packages/core/cli-update/src/upgrade/ownership-precedes-release-selection.spec.ts)

#### Process

##### Release previews preserve the canonical candidate

- Requirement: `system/process/release-preview-preserves-canonical-candidate`
- Owner: `axm`
- Statement: The local npm cohort preview workflow shall derive every preview version below the current stable cohort version so a first preview publication cannot cause canonical publication of that stable version to be treated as superseded.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `system/process/release-publication-preserves-newer-versions`
- Source: [`scripts/release-preview-version-preserves-candidate.spec.ts`](../scripts/release-preview-version-preserves-candidate.spec.ts)

##### Release promotion checks public validators before conditional updates

- Requirement: `system/process/release-promotion-validates-public-validators`
- Owner: `axm`
- Statement: Before conditionally updating an existing stable channel, release promotion shall verify that public reads negotiating identity, gzip, Brotli, and Zstandard return the same strong ETag and untransformed document, and shall perform no mutation if any read fails or disagrees.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The committed promotion entry point owns this release gate; bound tooling tests drive its network boundary with controlled responses without publishing a release.
- Methods: contract
- Derived from: `system/process/release-promotion-precedes-independent-distribution`
- Assumptions: A concurrent channel change may invalidate the preflight and requires a new invocation.
- Bound evidence: `test: axm:test (scripts/release-channel-promotion.test.ts)` — Exercises identity, gzip, Brotli, and Zstandard public reads before the Control PUT, rejects weak or absent validators, transformation, inconsistent validators or documents, and failed reads without mutation, and preserves conditional creation and newer-channel retention.
- Source: [`scripts/release-promotion-validates-public-validators.spec.ts`](../scripts/release-promotion-validates-public-validators.spec.ts)

##### Release publication preserves newer distribution versions

- Requirement: `system/process/release-publication-preserves-newer-versions`
- Owner: `axm`
- Statement: The canonical release workflow shall serialize active release publications across tags and stop an older candidate as superseded when a newer npm latest, Homebrew formula or stable version is observed, without moving those publications backward or attempting historical distribution repair.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.test.ts, scripts/release-channel-promotion.test.ts, scripts/update-homebrew-formula.test.ts)` — Exercises older candidates before publication and at owner write boundaries, equal-version formula conflicts and newer-channel retention.
- Source: [`scripts/release-publication-preserves-newer-versions.spec.ts`](../scripts/release-publication-preserves-newer-versions.spec.ts)

##### Release reruns reuse only identical published content

- Requirement: `system/process/release-publication-reuses-identical-content`
- Owner: `axm`
- Statement: A rerun of one release coordinate shall verify and reuse identical published content, publish missing outputs and reject conflicting bytes or failed existence queries without overwriting published outputs or requiring a promotion bypass.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.test.ts, scripts/release-channel-promotion.test.ts, scripts/update-homebrew-formula.test.ts)` — Exercises absent and identical outputs, integrity conflicts, failed existence reads, partial publication reruns, and identical-coordinate promotion without credentials.
- Source: [`scripts/release-publication-reuses-identical-content.spec.ts`](../scripts/release-publication-reuses-identical-content.spec.ts)

##### Release results distinguish distribution and promotion state

- Requirement: `system/process/release-workflow-reports-publication-state`
- Owner: `axm`
- Statement: The canonical release workflow shall report the exact candidate and every publication and verification result separately from confirmed, incomplete or uncertain promotion and superseded candidates, retaining uncertain submission evidence until bounded readback confirms channel state.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.test.ts, scripts/release-channel-promotion.test.ts, scripts/update-homebrew-formula.test.ts)` — Exercises publication boundary outcomes, one readback after a lost promotion response, uncertain readback failures, and no repeated conditional mutation.
- Source: [`scripts/release-workflow-reports-publication-state.spec.ts`](../scripts/release-workflow-reports-publication-state.spec.ts)

##### Stable promotion follows verified candidate distribution

- Requirement: `system/process/stable-promotion-follows-verified-distribution`
- Owner: `axm`
- Statement: The canonical release workflow shall attempt stable promotion only after publication of the candidate binary/checksum assets, fixed npm cohort, Homebrew formula and official skill, and successful exact-candidate script, published-package, Homebrew and official-skill installation verification; promotion failures shall not prevent that preceding distribution.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The canonical workflow graph defines required release readiness and exact-candidate job inputs.
- Methods: contract
- Derived from: `system/process/release-promotion-precedes-independent-distribution`
- Supersedes: `system/process/release-promotion-precedes-independent-distribution`
- Assumptions: The release coordinate is immutable and each required verifier reports truthful evidence about its named candidate.
- Limitation: Repository evidence checks the workflow graph; it does not execute the published installer platform matrix. Retires when: An authorized release supplies successful exact-candidate matrix results and promotion readback.
- Bound evidence: `test: axm:test (scripts/repository-task-interface.test.ts)` — Inspects the resolved promotion target and requires its workspace build prerequisites to follow the project graph, so a fresh candidate checkout does not depend on artifacts left by another job.
- Bound evidence: `test: axm:test (scripts/stable-promotion-follows-verified-distribution.spec.ts)` — Parses actual job dependencies and required success conditions, exercises each failed/skipped/canceled gate, and checks exact candidate inputs and the declared installer matrix.
- Bound evidence: `test: axm:test (scripts/verify-installed-package.test.ts)` — Runs the published-package verifier through a package-manager launcher with sibling entrypoints from an unrelated directory, including paths with spaces, and rejects wrong installed versions and unexpected stderr; Windows CI executes the batch-launcher cases.
- Source: [`scripts/stable-promotion-follows-verified-distribution.spec.ts`](../scripts/stable-promotion-follows-verified-distribution.spec.ts)

### Goal: workspace-intent-fidelity

Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.

#### Quality

##### MCP secrets stay in a per-connection credential namespace and out of workspace files

- Requirement: `cli/mcps/secret-namespaces-include-local-and-source-identity`
- Owner: `extension-lifecycle`
- Statement: When a locally named MCP connection is installed with a secret input, AXM shall keep the secret in the credential store under a namespace unique to the workspace, the local connection name, the source, and the input name, and shall write the secret value into neither axm.json, any agent's native configuration, nor the reported outcome.
- Class: quality (security)
- Role: supporting
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/core/extension-materialization/src/mcps/secret-store.ts`, `apps/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts`
- Open questions: When the credential store cannot persist a required secret, must installation fail, or may it complete with a warning and require the secret to be supplied later? The current statement promises storage; the controlled unavailable-store case establishes disclosure safety, not satisfaction of storage.
- Limitation: Default scenarios control the credential-store port. The separately selected platform execution exercises the actual system keychain only on its recorded host and access context; other operating systems and access policies remain unverified. Retires when: Run the same credential lifecycle against disposable keychain entries on each supported operating system.
- Additional evidence: platform via [`apps/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts`](../apps/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts) — Runs the built CLI's real MCP install, stored-input reload and secret replacement in its declared Node runtime against the host OS keychain, preserving host HOME for native access while isolating AXM_USER_HOME and project state. A subprocess loads the shipped identity build artifacts only to derive disposable cleanup identities, without a product source dependency in the test project. Producer and observer use the same runtime application identity across separate processes. Workspace/local/source/input namespaces are isolated and read back natively; a finally block deletes exactly the known disposable entries, requires affirmative deletion for every attempted write, and retains an independent cleanup journal on failure. This establishes only the recorded host and access context, not cross-application access, unavailable-keychain policy or every supported operating system.
- Source: [`packages/core/extension-lifecycle/src/mcps/install/secret-namespaces-include-local-and-source-identity.spec.ts`](../packages/core/extension-lifecycle/src/mcps/install/secret-namespaces-include-local-and-source-identity.spec.ts)

## Product goals

### Shared across AgentXM repositories

- `dependable-change-process` — Changes and releases land through the governed repository process with required evidence and human approval.
- `extension-adoption` — People and agents can find, install, update, and remove reusable extensions across coding agents through dependable product surfaces.
- `knowledge-access` — People and agents can discover concepts, commands, and contracts from the surface they are already using.
- `machine-automation` — Machine consumers can drive AgentXM surfaces non-interactively with complete, schema-backed results separated from diagnostics.
- `privacy-and-consent` — Observation of product use stays within the documented data boundary and under the control of the person being observed.
- `trustworthy-distribution` — Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.

### Local to AXM

- `actionable-diagnostics` — People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.
- `agent-interoperability` — Configured extensions realize correctly and completely for every configured coding agent's native surfaces.
- `authoring-and-creation` — Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.
- `platform-reach` — AXM works on every supported operating system, runtime, shell, and filesystem.
- `safe-repetition` — Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.
- `workspace-intent-fidelity` — Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.
