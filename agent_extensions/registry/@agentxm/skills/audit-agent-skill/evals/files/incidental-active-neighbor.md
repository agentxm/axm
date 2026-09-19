# Synthetic audit facts: incidental active neighbor

Audit target: `@example/skills/author-architecture-records@1.0.0`.

The target is non-standalone, recommends `@example/packs/architecture`, and is
a direct member of that pack with `@example/knowledge/architecture`,
`@example/skills/setup-architecture-records`, and
`@example/skills/maintain-architecture-records`. Its instructions reference
only those direct siblings.

The observed active catalog also contains
`@other/skills/author-docs@4.0.0`, installed through
`@other/packs/documentation`. Its description broadly covers writing and
revising repository documentation. Neither package declares the other package
or pack, and the supplied workflow does not require them to compose.

The audit scope is package relationship and routing-boundary correctness. No
behavioral run is supplied, and the facts do not establish that an actual
routing collision occurs.
