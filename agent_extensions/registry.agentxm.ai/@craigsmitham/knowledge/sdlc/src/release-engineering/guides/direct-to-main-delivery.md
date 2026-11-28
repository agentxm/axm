---
type: Guide
title: Direct-to-main delivery with parallel agents
description: Choose checks, integrate concurrent work, and confirm a release when developers and agents land changes directly on main and deploy from it.
tags: [continuous-integration, continuous-delivery, trunk-based-development, readiness, deployment, rollout, stale-evidence]
status: draft
sources:
  - id: trunk
    title: Fast, green builds
    resource: https://trunkbaseddevelopment.com/fast-green-builds/
  - id: steinberger
    title: Just Talk To It
    resource: https://steipete.me/posts/just-talk-to-it
  - id: ball
    title: Joy & Curiosity 71
    resource: https://registerspill.thorstenball.com/p/joy-and-curiosity-71
  - id: amp
    title: The Company of the Future
    resource: https://ampcode.com/podcast/season-02/episode-06
  - id: willison
    title: Red/green TDD
    resource: https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/
  - id: hooks
    title: Git hooks
    resource: https://git-scm.com/docs/githooks
  - id: deployment
    title: Deployment automation
    resource: https://dora.dev/capabilities/deployment-automation/
generated: { by: codex/gpt-6, at: 2026-11-27T23:48:04Z }
---

# Direct-to-main delivery with parallel agents

The implementer owns the change through shared main and follows its release to confirmation. A temporary branch or worktree can isolate a change while the implementer builds and tests it. Follow the repository’s integration policy, whether it accepts direct pushes, pull requests, or a merge queue. Releases originate from verified revisions of main.

## Choose a verification strategy

Choose the fastest path that exercises the consequential failures in time for the decision. Include queueing, rework, and the time other agents spend waiting. When two approaches finish in comparable time, prefer the one that uses fewer runner-minutes or less developer attention. A scoped project requirement can settle the choice.

For example, splitting a compatibility suite across spare runners can give the author an answer sooner. If those runners are already occupied, the same split may delay several other changes. When a prior run already covered the relevant inputs on the required platform, reusing its result can save both time and compute. A new platform, a changed contract, or a required independent run can justify the extra cost.

## Design the workflow around one real change

Trace a recently shipped change from the author's first check to its effect in production. Inspect the repository instructions, actual commands, CI triggers, artifact and deployment records, rollout controls, and available production observations. Distinguish the workflow the repository runs today from a proposed improvement. Establish which branch and revision supply a deployment, who or what initiates it, which checks are required, and where the result is visible. These repository facts belong in its own instructions or linked operational guidance.

Choose parallel work by the assumptions it shares. An API producer and a consumer can conflict across entirely different files. Coordinate the contract, sequence the changes, or land a compatible intermediate version. Independent fixes can proceed while that happens. Keep each change small enough to test and undo on its own. In a shared checkout, account for uncommitted edits when interpreting a test run and include only the intended changes in the commit. Steinberger describes choosing simultaneous work by the scope of each change and keeping agents’ commits separable.[^steinberger]

## Place checks where their results affect a decision

| Where work runs | Question and typical check | What depends on the result |
| --- | --- | --- |
| Implementer’s checkout or worktree | Exercise the changed path. Reproduce a defect with the smallest test, browser interaction, or real request that exposes it.[^willison][^ball] | Correct the behavior while the cause is fresh. |
| Local pre-commit hook | Does this staged snapshot pass quick, deterministic checks such as syntax or manifest validation? Check the staged content when unstaged edits could mask a failure. | Recording a commit, including a commit made directly on local main. Keep the underlying command runnable on demand. |
| Local pre-push hook | Do the outgoing commits pass the checks that depend on this revision or destination? Run a focused compatibility check here if it can avoid an expensive remote round trip. | Sending updates to the remote. A failed hook gives the implementer a chance to fix the candidate before pushing.[^hooks] |
| Before shared main changes | Does the candidate work with current main? Use a required CI result, merge queue, or the repository’s direct-push policy to check the combined revision where necessary. | Accepting the change on shared main. A commit to local main can still be unpublished. A hosted merge can bypass local hooks, so enforce any shared requirement at the integration point. |
| CI for the integrated revision | Does the clean build pass the required checks? Does the packaged artifact include what an installed consumer needs? Identify the revision and artifact each result covers. | Release eligibility when CI runs after landing. On a broken main, fix or revert promptly. |
| Deployment to a target | Does the verified artifact start or install with that target’s configuration and dependencies? Promote the same artifact through relevant environments.[^deployment] | Completing deployment. Hold the affected rollout on a failed installation or smoke test. |
| Exposure and use | Can the initial audience perform the intended task? Observe a representative request or a suitable traffic window. | Widening, pausing, or correcting the rollout and confirming recovery. |

A check can be initiated locally and exercise a remote preview. Record where it ran **and** which system it observed. Use a remote environment when hosted configuration or realistic dependencies matter, and check production when only exposure to the intended audience can answer the question.

A fast private build and a shared integration build can establish different facts.[^trunk] Place longer checks according to what a late failure would cost. If a compatibility test is the only way to catch an unreadable file format before distribution, wait for it before releasing the artifact. A broad exploratory run can proceed in the background when its findings can safely arrive later and someone will act on them. Use a representative test environment when an answer needs deployment configuration or realistic data. Introduce a shared staging environment when its evidence justifies the wait for access.

## Decide what still holds when main advances

Identify the revision and inputs behind a prior result. Compare the intervening changes with the behavior, dependencies, configuration, data, and artifact the check exercised. A new commit by itself tells you little about which claims need revisiting. Carry forward evidence whose assumptions still hold. If an assumption changed, test the interaction on the combined candidate. Keep required repository checks in force.

For example, an agent adds an order summary that reads an API fixture. While its tests run, another agent renames a field in the provider. The formatting tests still describe the summary code. The fixture-based pass establishes how it handled the old response. Run the actual provider and consumer together on the updated candidate and verify the displayed order total. A mismatch calls for a compatible change or a coordinated landing. If the tested candidate lands unchanged and project policy accepts the result, carry it forward. Check any remaining deployment requirements against the integrated revision. If another push wins the race, reconcile with the new tip and reconsider only the assumptions it touches.

## Choose the deployment and release boundary

Tie the deploy decision to a verified main revision and its artifact. Record what starts deployment, such as successful main CI, a release schedule, or an authorized promotion. If main advances while a build is in flight, promote the artifact whose checks passed. Preserve rollout order so an older job finishing late cannot replace a newer deployment unintentionally. An automatically deployed web service and a CLI distributed on a schedule can share main. Amp describes both cadences and using feature flags or instrumentation to learn from production before expanding a release.[^amp]

Choose exposure according to the cost of a wrong decision and the ability to recover. Use an existing flag, limited audience, or canary when it isolates a meaningful risk. Identify who or what will observe the deployed behavior and which result supports widening, pausing, or restoring it. When access or traffic is missing, state what has been established, what observation remains, and how to obtain it. A successful deployment record establishes which build reached an environment. Completion of the user’s task requires an observation tied to that behavior.

## Three changes through the same workflow

| Change | Before landing | From main through confirmation |
| --- | --- | --- |
| Correct a label on a settings page | Render the affected page with the relevant locale and check that the wording fits. An unrelated backend change leaves that observation useful. | Deploy the verified web artifact on the usual cadence. Open the affected route as the intended user and confirm the label appears. The normal rollout is sufficient if the text can be corrected cheaply. |
| Add an order summary while its provider changes | Exercise the real response through the consumer on the combined candidate. Retain unrelated results. A passing fixture test alone leaves an open compatibility question. | Deploy the compatible integrated revision. Exercise the order-summary path for an eligible account and check its total against the source order. Hold wider exposure if values disagree. |
| Change stored data while old workers are active | Use representative existing records. Exercise old and new readers and writers against the proposed schema. Rehearse interruption and resumption of the backfill. | Land compatible schema expansion first. Backfill incrementally and compare migrated values. Switch reads when evidence supports it and retire the old representation after old consumers are gone. If values diverge, pause writes or the backfill as appropriate, preserve recoverable data, and reconcile affected records. Reverting an application binary leaves persisted writes in place. |

When a release goes wrong, contain the affected path, confirm recovery with the same user-visible observation that revealed the failure, and identify when unrelated releases can resume. The implementer follows the decision to advance or hold the revision under the repository’s release policy. Draw on testing expertise for the design of a discriminating check and operations expertise for diagnosis and service recovery. Use [Delivering a software change](../foundations/delivering-a-software-change.md) to decide whether a workflow change reduced delay, interference, or user impact.

[^trunk]: [Trunk Based Development, Fast, green builds](https://trunkbaseddevelopment.com/fast-green-builds/).
[^steinberger]: [Peter Steinberger, Just Talk To It](https://steipete.me/posts/just-talk-to-it).
[^ball]: [Thorsten Ball, Joy & Curiosity 71](https://registerspill.thorstenball.com/p/joy-and-curiosity-71).
[^amp]: [Quinn Slack and Thorsten Ball, The Company of the Future](https://ampcode.com/podcast/season-02/episode-06).
[^willison]: [Simon Willison, Red/green TDD](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/).
[^hooks]: [Git hook semantics](https://git-scm.com/docs/githooks).
[^deployment]: [DORA on deployment automation](https://dora.dev/capabilities/deployment-automation/).
