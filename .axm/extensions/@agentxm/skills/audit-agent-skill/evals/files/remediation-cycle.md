# Synthetic audit and remediation cycle

Target: `workspace:@example/skills/format-release-notes`, version `0.2.0`,
content identity `sample-before-12`.

Accepted pre-change findings:

- A-01: the description lacks the positive verbs “format” and “normalize” and
  has no negative boundary against publishing release notes.
- A-02: a missing input file has no explicit failure behavior.

The package otherwise has a valid manifest, a stable output contract, no
scripts, no external side effects, and passing cases for supplied Markdown.
Remediation is authorized inside the target package only. Publishing and
approval are not authorized.
