# Synthetic audit remediation

Target: `normalize-release-notes` version `0.3.1`, content identity `sample-r8`.

Canonical package:
`skills/normalize-release-notes/`. The complete
current manifest, runtime source, evaluation contract, and cases are present in
that package and are the evidence against which the findings must be confirmed.

Supported behavior: normalize supplied Markdown release notes into the existing
heading and bullet format without publishing them.

Accepted audit findings:

- S-01: the description says only “Helps with releases,” so it misses requests
  to normalize or reformat release-note Markdown and collides with publishing
  workflows.
- S-02: the workflow has no branch for a missing input file and currently
  implies success without an output.

No script, dependency, permission, output schema, or publishing behavior should
change.
