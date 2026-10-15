---
name: testing
description: >-
  Selects, writes, reviews, consolidates, and optimizes software tests for fast,
  trustworthy feedback. Use when choosing test coverage, distinguishing
  specifications from ordinary tests, limiting integration or E2E scope,
  removing duplicate or trivial tests, diagnosing test failures, or improving
  local and CI test speed. Not for product incident response or release and
  deployment execution.
license: FSL-1.1-MIT
---

# Testing

Optimize the suite for fast, trustworthy decisions about consequential behavior.
Repository contracts own specification acceptance, file conventions, commands,
and required verification gates.

## Workflow

1. Identify the changed behavior or suite problem, accepted specifications,
   existing assertions, and the owning test commands. For speed work, inspect
   available timings before attributing cost to a test level.
2. Apply the principles below to choose the smallest sufficient evidence and
   identify redundant coverage. Use test names and assertions to make the
   protected behavior clear; no separate record is required for every test.
3. Perform the requested work within its scope. A review or strategy discussion
   produces findings or proposals; an implementation request may change tests
   and their fixtures. Diagnose failed checks before changing expectations.
4. Run the relevant checks for changes made. Report what protection changed,
   what evidence passed or remains missing, and measured timing differences
   when available. Do not claim a speedup from fewer tests alone.

## Principles

1. **Make feedback fast.** Keep routine behavior checks deterministic and
   preferably in memory, using real application code with controlled external
   dependencies. A fast test may exercise several real collaborating components;
   isolation means independence from other tests, not mocking every collaborator.
   Control time and identifiers; avoid sleeps. Measure elapsed local and CI
   feedback, including discovery, setup, builds, and reporting. Use separate
   budgets for focused development feedback and the full CI gate; investigate
   overruns before increasing them. During iteration, run the narrow relevant
   selection; run required broader checks once the change stabilizes, then rerun
   only what subsequent changes affect.

2. **Use specifications as primary evidence for accepted behavior.** An accepted
   executable specification states a requirement in domain language, with
   examples or properties that distinguish correct behavior from plausible
   failures. Its authority comes from the repository's acceptance process.
   Specification-based testing is a technique for deriving cases from intended
   behavior; ordinary tests can use it to express supporting component contracts
   without establishing accepted requirements. Acceptance and execution boundary
   are independent: a spec can run in memory or need a real boundary. Keep
   specifications distinguishable in discovery and results. Change accepted
   intent deliberately, never merely to accommodate the implementation.

3. **Require additional value from every test.** Before adding or retaining a
   test, identify the consequential failure it detects and check existing
   coverage. A meaningful spec already counts as a test. Do not add a unit test
   for each helper, wrapper, branch, or changed file. Consolidate assertions that
   prove the same behavior at the same boundary. Before removing a test, identify
   any unique input case, assertion, boundary, or useful diagnostic it contributes
   and preserve needed protection in the retained coverage. Overlap earns its
   place through a distinct failure mode, a separately promised reusable
   contract, or a material diagnostic benefit. Executing the same lines is
   insufficient evidence of duplication.

4. **Pay for real boundaries only when the claim needs them.** Use the cheapest
   environment that can expose the failure. Detailed business-rule combinations
   usually belong in memory; focused integration tests establish database,
   filesystem, protocol, or runtime semantics. Back in-memory substitutes with
   real adapter tests for those semantics. Use real browsers for browser behavior,
   with the smallest sufficient component or application scope. Keep E2E scenarios
   where exercising the assembled system or shipped artifact adds meaningful
   confidence about a consequential journey. Make that additional risk clear;
   cover detailed behavioral combinations at a cheaper boundary and review E2E
   scenarios for duplication and continued relevance.

5. **Cover important failures, not a percentage.** First derive cases from
   intended behavior: meaningful input groups, boundaries between outcomes,
   state transitions, invariants, and failure conditions. Include authorization,
   isolation, interruption, recovery, concurrency, and known regressions where
   they matter. Then inspect uncovered code for missed behavior; add tests where
   this reveals a consequential gap. Assert observable outcomes against intended
   behavior. Line and branch coverage guide review; percentages and test counts
   do not prove adequacy or define universal targets. Scale analysis to consequence,
   likelihood, and uncertainty. Use targeted properties, mutations, or a known
   defect reproduction to answer a specific uncertainty, including whether
   retained coverage detects a defect after consolidation. Do not require a
   worksheet, mutation run, or justification document for every test. Types,
   schemas, lint, and builds own mechanically decidable conventions; behavioral
   tests need not repeat those declarations.

6. **Keep evidence trustworthy and affordable to maintain.** Exercise behavior
   through stable interfaces. Preserve test validity through behavior-preserving
   refactoring; assert internal calls, ordering, or structure only when those
   details are part of the contract being tested. When tests require extensive
   setup, many mocks, or infrastructure unrelated to their claim, inspect the
   production boundaries and fixture design. Prefer a simpler design over
   increasingly elaborate test machinery. Keep fixtures focused on the scenario
   so shared setup does not perform unrelated work.

   Tests must isolate state, release resources, and fail with useful diagnostics.
   Substitute through production seams without replacing the boundary being
   proved; check shared contracts when substitute fidelity matters. A regression
   test must detect the defect. Skips, flakes, and retries do not establish a clean
   pass. Delete redundant or obsolete tests and their unused fixtures; preserve
   distinct needed protection when replacing expensive evidence. Optimize the
   suite as a whole, including execution, diagnosis, and maintenance cost.
