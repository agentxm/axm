---
name: testing
description: >-
  Authors, reviews, refactors, and maintains software tests for fast,
  trustworthy feedback about consequential behavior. Use when deciding what
  evidence a change needs, writing or changing tests, adapting coverage during
  production refactoring, investigating unreliable or slow suites, changing
  test runner configuration, task graphs, or verification gates, or deciding
  what coverage to retain, consolidate, replace, or remove. Includes executable
  specifications, fixtures, test doubles, and execution-boundary choices. Not
  for product incident response or release and deployment execution.
license: FSL-1.1-MIT
---

# Testing

Maintain the smallest clear, trustworthy body of evidence that gives sufficient
confidence in consequential behavior. Tests should support rapid development,
survive behavior-preserving refactoring, and remain useful as the product evolves.

These principles apply when authoring tests, changing production code,
refactoring test suites, and maintaining their fixtures and execution machinery.
Repository contracts own requirement acceptance, specification conventions,
commands, and verification gates.

## Principles

1. **Fast, dependable feedback.** Routine behavioral evidence is deterministic
   and inexpensive. Real application components can collaborate within a fast
   test. Time, identifiers, external dependencies, and shared state are controlled
   where they affect repeatability. Feedback cost includes discovery, setup,
   builds, execution, and reporting.

2. **Specifications express accepted intent.** Accepted specifications are
   primary evidence for the behavior they govern. A specification states one
   rule that can change independently of its neighbors. Its examples distinguish
   intended behavior from plausible failures. Supporting tests add evidence
   without creating competing requirements. Acceptance authority and execution
   boundary remain separate.

3. **Every test contributes useful protection.** Coverage earns its place through
   a distinct consequential case, failure mode, boundary, reusable contract, or
   diagnostic benefit. Overlap is justified by that contribution and is
   established by comparing cases and assertions, not by shared code paths. When
   two cases protect the same rule, the stronger case survives, placed where the
   requirement is discoverable and executes cheapest. Consolidation preserves
   needed protection; obsolete behavior and incidental implementation assertions
   need not survive, unless an implementation assertion is the stated diagnostic
   for a rule.

4. **Execution boundaries match the claims.** Detailed behavioral combinations
   usually have inexpensive evidence. Real database, filesystem, protocol,
   runtime, browser, and assembled-system checks establish properties that
   cheaper substitutes cannot. Substitutes stand in at a declared seam such as a
   service, port, or protocol boundary, and the test states what the substitute
   cannot establish. Replacing modules by import path couples evidence to
   structure rather than behavior.

5. **Confidence comes from meaningful failure detection.** Cases reflect intended
   outcomes, important boundaries, invariants, and relevant failure conditions.
   Expected results can expose incorrect implementations rather than reproduce
   their calculations. Presence of text in source or configuration is evidence
   of that text, not of the behavior it names. Coverage percentages and test
   counts inform investigation without establishing adequacy. The depth of
   evidence follows consequence and uncertainty.

6. **Evidence remains trustworthy and affordable to maintain.** Tests observe
   stable behavior and tolerate valid implementation changes. Fixtures make
   relevant conditions clear without unrelated setup. State isolation, resource
   cleanup, and useful failures support diagnosis. Skips, retries, pending cases,
   and stale results do not establish a clean pass. Evidence delegated to another
   location is linked so its presence and outcome can be checked; otherwise the
   obligation reads as unverified. Simpler production boundaries are preferable
   to increasingly elaborate test machinery.

Claims about protection, reliability, and performance remain proportionate to the
evidence available; uncertainty stays explicit. Timing claims are attributed to
the command, revision, and host that produced them; summed file times are not
elapsed feedback.
