---
name: build-report
description: Builds a local report from caller-selected input and output paths. Use for the package's deterministic local report workflow. Not for publishing or network access.
license: MIT
compatibility: Requires Python 3.11 or later.
---

# Build a local report

Resolve the caller-selected input and output beneath the caller's working
directory, then run `python3 <skill-root>/scripts/build_report.py <input>
<output>`. Stop without writing when validation fails. Completion requires a
zero exit status and the named output file.
