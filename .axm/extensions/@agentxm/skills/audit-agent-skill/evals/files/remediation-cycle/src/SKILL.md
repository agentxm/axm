---
name: format-release-notes
description: Prepares release notes supplied as Markdown.
license: MIT
---
# Prepare release notes

Create a normalized local Markdown copy of caller-supplied release notes.

## Input and output

The caller supplies one Markdown input path. Write the result beside it as
`<stem>.normalized.md` without overwriting an existing file.

## Workflow

1. Read the supplied Markdown file.
2. Preserve headings, list order, links, code blocks, and factual wording.
3. Remove trailing whitespace and ensure exactly one terminal newline.
4. Write the normalized output path only when it does not already exist.
5. Return the output path and state that no publication occurred.

Do not publish, upload, or otherwise distribute the release notes. Completion
requires the normalized local file and a response naming its path.
