---
type: Guide
title: "Writing an extension README"
description: "Choose an example and the details a reader needs to decide whether to install an extension and try it."
tags: ["readme", "authoring", "installation", "usage", "examples"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:52:30Z" }
sources:
  - id: skills
    resource: https://github.com/anthropics/skills#claude-code
    title: Anthropic Skills README
  - id: actions
    resource: https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions#creating-a-readme-file-for-your-action
    title: GitHub Actions README guidance
---

# Writing an extension README

Write for someone deciding whether to install the extension. Open with the task
it helps them accomplish. Give the install command, then show one realistic
first use and the result to expect.

For a skill, show a request and its result.[^skills] For a hook, show the event
and its observable effect. For knowledge, show a question and the concept
that answers it.

For example, the README for an archive-review skill might invite the reader
to ask “Can an installer open the migration guide in this archive?” Tell
them to expect the linked path and a verdict based on the archive listing.
Try that request using only the README and the files an installer receives.

Mention a prerequisite, permission, side effect, or limitation when it changes
the install decision or the example.[^actions] Link deeper instructions and
release history. Stop when the reader can choose, install, and try it.

## When the extension belongs to a pack

Someone can discover a member before they discover its pack. Give each
independently discoverable package its own root `README.md`. The pack README
owns shared setup and an example of a task the members accomplish together.
The member README explains its contribution and shows a first use of that
member. Link to the pack using a destination the reader can open from the
distributed package.

When companions are required, lead with the pack install command and explain
what the companion supplies. For a standalone member, show how to use it
directly and explain what installing the pack adds. In AXM, check both
`standalone` and `recommendedPacks` in the member manifest. A recommended
pack can include a member that also works independently.

[^skills]: Anthropic Skills README, Claude Code example.

[^actions]: GitHub, Creating a README file for your action.
