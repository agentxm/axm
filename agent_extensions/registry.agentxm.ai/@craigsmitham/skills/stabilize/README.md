# stabilize

Stabilize a codebase or specified scope by correcting failures and material weaknesses in behavior or engineering feedback.

Use this skill when software or its feedback mechanisms are unreliable. The
self-contained [skill](src/SKILL.md) covers corrections to behavior, security,
tests, builds, and environments, with evidence tied to the actual weakness.

## Usage

Invoke directly with the observed problem or supported risk and affected scope.
Automatic model invocation is disabled through the supported native settings.

An opportunity question requests findings and recommendations without edits:

```text
Where could we $stabilize our build and test pipeline?
```

A direct change request asks for implementation and verification:

```text
$stabilize the importer against partial writes after an interrupted run
$stabilize the test pipeline's intermittent failures without masking regressions
$stabilize our build so equivalent declared environments produce reliable results
```

## Boundaries and evidence

Stabilization restores dependable behavior or feedback. Improvement advances a
selected quality relative to its baseline. The techniques can overlap, but the
requested outcome determines completion. A corrective change can intentionally
alter defective behavior while preserving applicable obligations.

Diagnosis distinguishes observed failures, supported risks, and hypotheses.
Urgent containment may be useful before the cause is fully understood; it must
not be represented as a completed durable correction. Appropriate regression
evidence should discriminate the original weakness from the intended result.
Retries, skips, quarantine, or weaker checks can conceal failures and do not
establish that the cause has been corrected.

The skill leaves tools and methods to the caller and model. Local verification
does not establish production recovery, and the selected scope determines
whether deployment or operational action belongs to the task.

## Sources and inspiration

- [DORA's test-automation guidance](https://dora.dev/capabilities/test-automation/)
  informs reliable, timely feedback and continuing test-suite maintenance.
- [NIST SSDF](https://csrc.nist.gov/projects/ssdf) informs identification,
  remediation, and root-cause learning for security weaknesses.
- [Fowler's refactoring workflows](https://martinfowler.com/articles/workflowsOfRefactoring/fallback.html)
  inform keeping corrections distinguishable from behavior-preserving restructuring.
- [SWEBOK's maintenance chapter](https://swebokwiki.org/Chapter_5:_Software_Maintenance)
  informs corrective and preventive maintenance.

The instructions are an original synthesis. Source procedures are not imposed
as a universal workflow, and checks of package structure do not establish
behavioral effectiveness.

## License

MIT. Linked sources retain their respective rights; no source text or code is
vendored in this package.
