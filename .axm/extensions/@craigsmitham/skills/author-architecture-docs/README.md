# Author architecture docs

Creates and revises human-readable software architecture docs that preserve
the smallest accepted semantic delta over repository and runtime authorities.

Use it for architecture overviews, responsibility and boundary documents,
product quality requirements, corpus organization, offering and
value models, capability/feature/surface models, DDD context views, C4 model
views, Wardley-informed strategic views, and focused document reviews. Do not
use it for initial setup or whole-set maintenance, to choose among architecture
alternatives, to turn a proposal into accepted design, or to mirror the
implementation in prose. Product research, roadmaps, pricing, sales, and
marketing content remain outside the skill unless architecture documentation
is the requested artifact.

For each concept type in the software architecture docs application profile,
the skill routes to a concise one-artifact guide. It creates only the requested
semantic artifact and required navigation. Adjacent additions, reductions, or
reorganizations are grounded recommendations until the user authorizes them.
Every admitted concept receives a stable named file from its first appearance;
plural catch-all documents are not temporary concept homes.

This skill is a non-standalone member of the software-architecture pack because
it loads that pack's software-architecture knowledge.

## Install

```bash
axm install @craigsmitham/packs/software-architecture
```

## Example

> Revise `docs/architecture/reservations.md` so it preserves the accepted
> reservation responsibility, recovery invariant, and evidence routes without
> duplicating the state-machine tests.

## License

MIT. The software-architecture knowledge bundle retains its separately declared
license.
