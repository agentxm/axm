---
type: Explanation
title: Quality gate
description: How a gate controls workflow progression with an explicit decision based on evidence, policy, or approval.
tags: [workflow, pattern, gate, approval, policy, quality]
status: draft
sources:
  - id: azure-gates
    resource: https://learn.microsoft.com/en-us/azure/devops/pipelines/release/approvals/gates?view=azure-devops
    title: Azure Pipelines deployment gates concepts
  - id: github-environments
    resource: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
    title: GitHub Actions deployments and environments
  - id: aws-codepipeline
    resource: https://docs.aws.amazon.com/codepipeline/latest/userguide/concepts.html
    title: AWS CodePipeline concepts
generated:
  by: openai/gpt-5
  at: 2026-08-08T16:15:49Z
---

# Quality gate

A **quality gate** is a control point that permits, denies, or delays workflow
progression according to explicit evidence, policy, or approval. It turns an
implicit assumption such as “safe enough to deploy” into an addressable
decision with inputs, criteria, outcome, and history.

Platforms implement gates through automated health and policy checks, manual
approvals, environment protection, conditions, and transitions.[^azure-gates][^github-environments][^aws-codepipeline]

[^azure-gates]: Azure Pipelines deployment gates concepts
[^github-environments]: GitHub Actions deployments and environments
[^aws-codepipeline]: AWS CodePipeline concepts

## Structure in the workflow model

A gate is a work unit whose primary role is control rather than transformation.
It consumes evidence or an approval decision, produces a progression decision,
and usually protects a target, group, or downstream task.

Its states should distinguish at least:

* **waiting** — evidence or an authorized decision is not yet available
* **passed** — stated criteria were satisfied
* **failed or denied** — criteria were not satisfied or approval was rejected
* **timed out** — no acceptable decision arrived within the allowed interval
* **bypassed or overridden** — progression was explicitly authorized outside
  normal criteria

Skipped, timed-out, and overridden are not synonyms for passed.

## Evidence before decision

A gate is only as meaningful as its evidence. Useful evidence is:

* relevant to the risk being controlled
* attributable to the same revision, artifact, or target being advanced
* fresh enough for the decision
* available to the decision maker in understandable form
* retained with the decision for later explanation

An automated gate may consume test results, policy evaluations, signatures,
coverage thresholds, vulnerability findings, change windows, or target health.
A human gate may consider judgment that is difficult to automate. Human review
should not compensate for missing routine evidence that automation could have
presented earlier.

## Placement

Place a gate at the boundary where its decision has force. A pre-deployment
gate may protect access to an environment or its secrets. A post-deployment
gate may observe target health before broader promotion. A merge gate may
protect the shared mainline.

Too early, and the evidence may not represent the candidate that reaches the
target. Too late, and unsafe or expensive effects have already occurred.

## Policy ownership

When the workflow author can rewrite both the work and its gate, the control
may not be independent. Platforms therefore often attach protection rules to
the target environment or another resource controlled by its owner. GitHub,
for example, withholds environment secrets until applicable protection rules
pass.[^github-environments]

An override path may be necessary, but it should identify the actor, reason,
scope, and evidence available at the time. Invisible bypasses make the normal
gate's assurance impossible to interpret.

## Quality consequences

| Concern | Positive effect | Cost or risk |
| --- | --- | --- |
| Effectiveness | Prevents progression without required evidence | Poor criteria can certify the wrong outcome |
| Performance | Stops bad candidates before expensive downstream work | Waiting and serial gates increase lead time |
| Efficiency | Avoids work or effects known to be unacceptable | Repeated polling and redundant approvals consume resources and attention |
| Dependability | Makes progression criteria and exceptions explicit | Flaky evidence creates unstable decisions |
| Experience | Gives users a clear decision point and reason | Opaque failures or approval queues turn the gate into bureaucracy |

## Common failure forms

* **Ceremonial approval** — the approver lacks timely evidence or meaningful
  authority.
* **Flaky gate** — unreliable checks make progression probabilistic.
* **Unowned wait** — no person or system is responsible for resolving the gate.
* **Detached evidence** — checks describe a different revision, artifact, or
  target.
* **Binary opacity** — pass/fail is shown without criteria, inputs, or reason.
* **Permanent emergency bypass** — exceptions become the ordinary path while
  the nominal gate remains for appearance.

## Related

* [Workflow model](../workflow-model-explainer.md)
* [Pipeline](pipeline-explainer.md)
* [Continuous delivery](../practices/continuous-delivery-explainer.md)
* [Continuous deployment](../practices/continuous-deployment-explainer.md)
