# Synthetic audit facts: undeclared cross-pack dependency

Audit target: `@example/skills/author-architecture-records@1.0.0`.

Its manifest declares `standalone: true` and no recommended pack. Its
instructions state that every invocation must first open and follow
`.axm/extensions/@other/skills/author-docs/src/SKILL.md`. That other skill is
installed only through `@other/packs/documentation`; there is no shared pack,
host contract, or supplied workflow declaring the relationship.

The audit scope is package relationship correctness. No behavioral run is
supplied.
