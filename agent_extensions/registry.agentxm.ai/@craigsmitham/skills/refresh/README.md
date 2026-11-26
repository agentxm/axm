# refresh

Refresh a codebase or specified scope to remain supportable as dependencies, platforms, toolchains, and external contracts evolve.

Use this skill when support lifecycles or environmental changes justify an
upgrade or migration. The self-contained [skill](src/SKILL.md) follows the
compatibility of the resulting system through consumer migration and removal
of transitional machinery.

## Usage

Invoke directly with the scope, target or reason for change, and support limits.
Automatic model invocation is disabled through the supported native settings.

An opportunity question requests findings and recommendations without edits:

```text
What opportunities do we have to $refresh our runtime and dependencies?
```

A direct change request asks for implementation and verification:

```text
$refresh our runtime and build tooling to supported compatible versions
$refresh this integration for the provider's replacement API, preserving supported uses
$refresh the dependency stack and complete the obsolete adapter migration
```

## Boundaries and completion

Refresh responds to a changed environment or support lifecycle. Newness alone
does not establish value. Removing an unused integration may eliminate the
need for its upgrade; an upgrade may also make custom machinery unnecessary.
Actual contracts, support needs, and total costs determine the choice.

Dependencies form a network, including transitive constraints, runtime and
compiler requirements, deployment environments, and data contracts. Installing
or compiling a target is only part of compatibility evidence. Relevant upstream
release and migration information must match the versions in question.

Migration includes consumers and persistent state where affected. A source
rollback does not necessarily reverse a data transformation. Temporary
adapters and compatibility paths remain obligations until their consumers have
moved; unfinished transitions need explicit ownership and exit conditions.

## Sources and inspiration

- [Software Engineering at Google: Dependency Management](https://abseil.io/resources/swe-book/html/ch21.html)
  informs dependency networks, compatibility, and ongoing ownership costs.
- [Software Engineering at Google: Deprecation](https://abseil.io/resources/swe-book/html/ch15.html)
  informs consumer migration, bounded disruption, and completing removal.
- [NIST SSDF](https://csrc.nist.gov/projects/ssdf) informs relevant security
  and software-integrity considerations.
- [SWEBOK's maintenance chapter](https://swebokwiki.org/Chapter_5:_Software_Maintenance)
  informs adaptive maintenance, migration, and retirement.

These are foundations for an original synthesis, not a prescribed upgrade
policy or evidence that every new release is safe or desirable.

## License

MIT. Linked sources retain their respective rights; no source text or code is
vendored in this package.
