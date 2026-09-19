---
name: normalize-release-notes
description: Helps with releases.
---
# Normalize release notes

Read supplied Markdown release notes, normalize their headings to `Added`,
`Changed`, and `Fixed`, preserve existing prose and code spans, and write the
result to the explicitly named output file.

Do not publish, deploy, tag, or create a release.

## Workflow

1. Read the supplied Markdown file.
2. Normalize recognized headings and preserve the existing bullet format.
3. Write the named output file.

Report the output path when finished.
