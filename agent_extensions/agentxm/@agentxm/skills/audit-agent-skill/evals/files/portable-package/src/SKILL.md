---
name: local-markdown-formatter
description: Formats and normalizes one supplied local Markdown file into a caller-selected local output path. Use when asked to apply the package's deterministic Markdown formatting rules. Not for publishing, uploading, or editing files that the caller did not name.
license: MIT
compatibility: Requires Node.js 20 or later.
---
# Format local Markdown

Format exactly one caller-supplied Markdown file with the bundled deterministic
formatter.

## Inputs

- An existing input path under the current working directory
- A distinct output path under the current working directory

If either path is absent, outside the working directory, or resolves to the
same file, stop without writing and report the invalid input.

## Workflow

1. Treat the caller-approved current working directory as the input/output
   authority root; do not change it to the skill directory.
2. Resolve `<skill-root>` as the directory containing this `SKILL.md`.
3. Resolve both caller paths under the authority root and confirm the input
   exists.
4. From the authority root, run
   `node <skill-root>/scripts/format.mjs <input> <output>`.
5. Require a zero exit status and confirm the output exists.
6. Return the output path and the formatter's reported byte count.

The script reads the named input and writes the named output. It performs no
network, subprocess, credential, deletion, or publication action. Do not retry
after a validation or write failure; preserve any pre-existing output and
report the error.

Completion requires the named output file and a successful formatter result.
