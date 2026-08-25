# Set up architecture docs

Plans or establishes the minimal repository-local adoption, navigation,
authority, and agent discovery needed to use Just Enough Architecture Docs.
It classifies the repository before acting, supports one or several explicitly
mapped systems, establishes required OKF v0.2 and software-architecture-docs
profile conformance, and avoids empty documentation trees or substantive
architecture by inference.

Use it when a repository is planning or adopting the practice for the first
time, needs scattered accepted material connected to one canonical root, or
needs several accepted system corpora exposed coherently. Do not use it to
choose an architecture, author substantive desired-state meaning, assess or
repair an established corpus, or maintain existing architecture docs.
Existing unprofiled documentation is preserved as migration input rather than
accepted as an alternative Just Enough Architecture Docs format.

This skill is a non-standalone member of the Gen Stack pack because
it loads that pack's software-architecture knowledge.

## Revision 0.7.0

- Establishes the required System, lifecycle, ownership, decision-policy, and assurance
  concepts at every system corpus root.
- Blocks a conforming setup claim when accepted kernel meaning is unavailable
  rather than inventing placeholders or inferring it from implementation.
- Creates `decisions/` and subject-colocated Requirement collections only when
  accepted named concepts require them.
- Treats migration of accepted obligations embedded in architecture prose as
  an explicit semantic-ownership change, preserving architectural context
  while moving the normative statement to one Requirement.
- Treats existing tests and evaluations as potential linked witnesses rather
  than substitutes for accepted Requirement authority.

This is a breaking change from `0.5.0`. Existing profile `0.9.0` corpora require
an evidence-backed migration to the System root and Requirement model; rollback
is to `0.5.0`.

## Install

```bash
axm install @craigsmitham/packs/gen-stack
```

## Example

> Set up Just Enough Architecture Docs for this repository. Preserve the
> accepted boundary material in place, use the repository's canonical
> instruction route, avoid empty collections, and surface missing lifecycle or
> stewardship context for later authoring.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
