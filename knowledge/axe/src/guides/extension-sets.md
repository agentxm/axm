---
type: Guide
title: "Designing and reviewing sets of extensions"
description: "Trace a change and a request to decide which extensions should evolve independently, work together, or ship together."
tags:
  ["modularity", "extension sets", "cohesion", "coupling", "ownership", "routing", "composition"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:47:52Z" }
sources:
  - id: parnas
    resource: https://doi.org/10.1145/361598.361623
    title: On the Criteria To Be Used in Decomposing Systems into Modules
---

# Designing and reviewing sets of extensions

Choose the set according to the decision you need to make.

| Set                                       | Question                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Extensions authored in a repository       | If a policy changes, where does the author edit it, and which consumers need to adapt?              |
| Members of a pack                         | What task does installing these members together enable for someone starting in an empty workspace? |
| Extensions active together in a workspace | Given the same request or event, which extensions participate, and what is their combined effect?   |

Two skills maintained in one repository may serve different consumers. A skill and a hook from different packs may both write to the same file. Use the authorship, membership, or active configuration that bears on the question.

For “review everything we author here,” establish which extensions the
repository owns, including disabled ones. Suppose a release skill and a
disabled migration skill each define the threshold for a breaking change.
Each could pass its own examples. Changing the threshold reveals two places
to edit and two consumers that depend on the same decision. Name the owner
and the consumers when recommending where that policy should live. If only
part of the authored inventory is available, bound the conclusion to that part.

## Trace a change

Pick a decision that has changed before or could plausibly change. Find the source that owns it. Follow what its consumers rely on and ask which of them would need editing. This applies Parnas's information-hiding principle to extensions. A good boundary lets the owner change a decision without forcing every consumer to learn the details.[^parnas]

Take the AXE pack. Its routing skill, `axe`, directs README questions to the [README guide](authoring-readme.md). Suppose the author improves the advice on explaining a pack dependency. The knowledge concept owns that judgment. As long as its purpose and address hold, the author can revise its examples without touching the router. Renaming the concept, on the other hand, calls for updating the route. That difference tells you what a consumer actually depends on.

Look at why the edits travel together. Review and repair can share one skill when they depend on the same judgment, even though repair needs additional authority. Two independently useful skills can share a knowledge concept when both would otherwise maintain the same policy. Split responsibilities when one serves a distinct consumer or changes for a different reason and you can say exactly what passes between them. Follow a delegated decision to the member that settles it. Two members that refer the decision back to each other leave the caller without an answer.

## Trace a request

Start where a user would start. Follow a representative request through selection, the guidance loaded, any handoff, and the resulting action. Try the [nearest variation](../patterns/neighboring-intent.md) that should select a different capability or stop earlier.

Suppose a routing skill's README tells readers to install the skill alone, then opens a concept supplied by its pack's knowledge bundle. Ask `axe` to “review this extension README's installation advice.” The review can identify the missing companion and recommend installing the pack. It ends with that recommendation. Now say “apply that correction to the managed source.” The selected finding supplies the edit's scope. In an AXM workspace, the `axm` skill directs the agent to resolve the edit owner, so it can change the authored README and check that the revised installation supplies the concept. The user can carry one finding across that handoff without choosing the target a second time.

This example also settles a membership question. The engineering pack promises design and review guidance through `axe` and its knowledge bundle. The follow-up introduces [workspace management](workspace-management.md). Cooperation with `axm` on that request gives no reason by itself to require it for every engineering-pack consumer. For a proposed member, identify which promised task would lose a needed capability without it, then try that task using the [clean-consumer procedure](composing-packs.md).

Check interactions that have no declared dependency. If a skill appends a release note and an active hook appends one on the same edit, inspect the resulting file for duplicate entries. If adding a skill forces edits to several siblings' trigger descriptions, try the competing requests and a request that needs both skills. Keep a boundary when it helps the agent select the right work. Reconsider it when it causes a repeated question, an unnecessary lookup, or the same effect twice. Recheck a proposed change on the request that exposed the problem and on a neighboring request that already worked.

[^parnas]: D. L. Parnas, [On the Criteria To Be Used in Decomposing Systems into Modules](https://doi.org/10.1145/361598.361623), 1972.
