---
type: Guide
title: How to write a playbook
description: When people repeatedly face a situation with several plausible responses, turn their evidence, decision rights, and handoffs into a playbook they can rehearse.
tags: [docs, playbook, authoring, response, handoff, exercise]
status: draft
sources:
- id: aws
  resource: https://docs.aws.amazon.com/wellarchitected/latest/framework/rel12-bp01.html
  title: AWS — Use playbooks to investigate failures
generated: { by: codex/gpt-6, at: 2026-11-22T02:00:19Z }
---

# How to write a playbook

Start with an occasion when the team faced several plausible responses.
Ask what the people involved could observe at the time, which decisions
they could make themselves, and when they needed to bring someone else
in.[^aws] Find out how they judged whether their response helped.

## Recover the first decision from the case

Suppose an event team asks for “a playbook for long registration lines.”
Ask the desk lead to walk you through one rush. Where were people
waiting? What could a lead observe from the floor? Who could move a
volunteer? What was the lead waiting to know before making that call?

Write an opening that somebody could recognize during their shift. For
this example, assume the team already uses a marked overflow point and
has agreed who can open a second desk. The draft can say, *Open this
playbook when the registration line reaches the overflow marker. The desk
lead coordinates until the floor manager accepts a handoff.* Substitute
the team's actual trigger and authority in your own document.

## Write a decision that changes the response

Use evidence available to the responder. Replace “identify the cause of
the delay” with something a person can observe. Expand the branch that
needs coordination far enough to show who does what. A passage for the
imagined venue might read as follows.

> Desk lead, follow one guest from arrival to admission. Where do they wait?
>
> - **Before anyone checks their name.** If the spare staffed terminal is
>   ready, ask its clerk to take the next guest. Tell the line volunteer
>   which guests to send there.
> - **After their name is checked.** If several checked-in guests are
>   waiting for the shared printer, send the badge volunteer to the
>   preprinted collection desk. Direct only preregistered guests there.
> - **At the entrance with badges already in hand.** Call the floor
>   manager with the waiting location and guest count. Ask them to take
>   charge at the entrance and confirm who will update registration.
>
> If the selected desk lacks staff, equipment, or prepared badges for
> the guests you would send there, tell the floor manager what you found.
> If several queues are growing, agree with the manager which queue each
> person will watch.
> Keep one person directing arrivals.

If a response already has a local procedure, name its entry condition and
link it where the responder chooses that action. Keep the decision and
the handoff in this playbook. Give the execution detail one maintained
home.

## Make the next observation part of the response

Ask the lead what would persuade them to continue, switch, or stand down.
*Desk open* only confirms an action. Add the outcome the team wants and
when to look again. For this venue the lead might write, *After the next
group enters, check the overflow marker and look for waiting beyond
registration. If the entrance line is growing, give the floor manager the
before-and-after counts. Stand down when the line has cleared the marker
and the entrance is admitting guests at their arrival rate.*

## Rehearse a case where the first explanation fails

Give a colleague the first observation and the draft. Hold back the
rest of the case until they ask for the relevant evidence. If they choose
the spare terminal, tell them both clerks are now waiting for badges.
Can they change course, find a person with authority, and say what
observation will show whether the response helped? Try a second pass
in which the expected person is unavailable. Ask the shift lead who
can accept the decision in their absence and what the responder can do
while waiting. If the team has no agreed cover, record that gap for the
lead to settle. Once a deputy is named, replay the handoff with the
revised directions.

Record the assumptions the rehearsal exposed and ask the local lead to
confirm roles, equipment, and escalation contacts. A tabletop can reveal
a missing handoff. Whether the extra desk clears a real queue requires
observations during an event.

[^aws]: AWS, [Use playbooks to investigate failures](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel12-bp01.html).
