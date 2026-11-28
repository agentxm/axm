---
type: Pattern
title: Playbook
description: For a recurring class of situations requiring assessment and judgment, guide practitioners in choosing, combining, and adapting responses with explicit coordination and escalation.
tags:
- docs
- playbook
- operations
- coordination
- decision-making
- diagnosis
- documentation-pattern
- pattern
- authoring
status: stable
sources:
- id: aws-playbooks
  resource: https://docs.aws.amazon.com/wellarchitected/2024-06-27/framework/ops_ready_to_support_use_playbooks.html
  title: AWS — Use playbooks to investigate issues
- id: atlassian-team-playbook
  resource: https://www.atlassian.com/team-playbook
  title: Atlassian — Team Playbook
- id: ise-playbook
  resource: https://microsoft.github.io/code-with-engineering-playbook/
  title: Microsoft ISE — Engineering Fundamentals Playbook
- id: redhat-ansible-playbook
  resource: https://www.redhat.com/en/topics/automation/what-is-an-ansible-playbook
  title: Red Hat — What is an Ansible playbook
- id: kube-prometheus
  resource: https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubepodnotready/
  title: kube-prometheus runbooks — KubePodNotReady
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:15:25Z'
---

# Playbook

Choose a playbook when a team recognizes a recurring situation but needs to
investigate, choose among responses, or coordinate people whose observations
change what others should do. The team needs enough experience to offer
defensible choices, including a way to get help when the evidence fits
none of them.[^aws-playbooks]

## Illustrative example

Consider a team responding to elevated checkout errors. Someone must establish
which customers are affected, correlate failures with changes in checkout
and its dependencies, and keep support informed. A release followed by
errors gives the team a hypothesis. Errors concentrated in the changed
version would support considering rollback. Errors across versions during
a provider outage suggest involving the dependency owner instead.

Once the team selects an approved rollback, the
[runbook](runbook.md#illustrative-example) can guide the deployment task.
A report that the old version is serving closes that task. The playbook
brings the team back to checkout success and customer reports. If failures
persist, investigation continues. This invented case illustrates how a single
incident can require both forms.

## Tradeoffs

A shared response helps several people act on the same evidence, even when
they need to work in parallel. Exhaustive branching can slow them down or
lend an outdated diagnosis the appearance of authority. The design is most
useful where a responder can recognize a consequential difference, collect
the information it calls for, and get help with an unfamiliar case. Keeping
contact roles, signals, and linked procedures current costs real rehearsal
and maintenance time.

For a bounded task with established execution and recovery, a runbook can
stand alone. A [checklist](checklist.md) can support one pause within a
response when the main risk is missing a known action or communication.
The need to make situational choices explains when a playbook adds value to either.

## Terminology

Local names vary. The kube-prometheus project calls its guidance for an
unready pod a *runbook*. The alert can arise from different conditions.
Readers use events, logs, and configuration to narrow the cause before
choosing a remedy.[^kube-prometheus] For a team designing guidance for
that decision, the investigation is where this bundle’s playbook pattern
fits. A team can keep the name its responders already look up.

Check what a named resource actually delivers. Atlassian’s Team Playbook
collects facilitated activities.[^atlassian-team-playbook] Microsoft’s
Engineering Fundamentals Playbook collects engineering practices and
checklists.[^ise-playbook] An Ansible playbook specifies automation to
execute.[^redhat-ansible-playbook] The shared name alone tells a responder
little about which resource will help them choose a response.

For an account of why response choices change, read
[How a playbook guides a response as evidence changes](../explainers/playbook.md).
To draft and rehearse one with a team, see
[How to write a playbook](../guides/writing-a-playbook.md).

[^aws-playbooks]: AWS, [Use playbooks to investigate issues](https://docs.aws.amazon.com/wellarchitected/2024-06-27/framework/ops_ready_to_support_use_playbooks.html).
[^atlassian-team-playbook]: Atlassian, [Team Playbook](https://www.atlassian.com/team-playbook).
[^ise-playbook]: Microsoft ISE, [Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/).
[^redhat-ansible-playbook]: Red Hat, [What is an Ansible playbook?](https://www.redhat.com/en/topics/automation/what-is-an-ansible-playbook).
[^kube-prometheus]: kube-prometheus runbooks, [KubePodNotReady](https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubepodnotready/).
