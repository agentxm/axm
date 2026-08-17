# Effect v4

This pack installs three members for Effect 4.0.0-rc.110:

- `@craigsmitham/rules/use-effect-v4` — instructs agents to use Effect v4 APIs
  and conventions rather than carrying Effect v3 patterns forward.
- `@craigsmitham/skills/craft-effect-v4` — routes Effect v4 architecture,
  implementation, and review work to the guide that applies.
- `@craigsmitham/knowledge/effect-v4` — an OKF 0.2 bundle of twenty-four
  guides, each opening with the conditions it applies to and what it leaves
  alone, so you can route from a symptom rather than a topic.

Install the pack rather than a member. The skill and bundle set `standalone:
false`: the skill routes to guides the bundle supplies, and the bundle expects
the skill to route to it.

See the [bundle
index](https://github.com/craigsmitham/agent-extensions/blob/main/.axm/extensions/%40craigsmitham/knowledge/effect-v4/src/index.md)
for the full guide list and when each one applies.

## Reference implementations

When authoring or revising these guides, treat the following as the reference
codebases for idiomatic Effect. Read current v4 code in these projects before
documenting an API; do not carry forward Effect v3 conventions found in older
revisions. Pinned prerelease versions drift and are not a reason to discount a
reference — judge it on the surface area it exercises. Do check that a
reference is on the v4 line at all: several prominent Effect projects, including
`effect-atom`, are still on v3.

Primary, broad surface area:

- The Effect library itself — source, tests, and examples.
- [opencode](https://github.com/anomalyco/opencode) — the widest applied
  surface available: services and layers, schema boundaries, resource safety,
  HttpApi, streams, structured concurrency, observability, request caching,
  `effect/testing`, and SQL. Large enough that it is only useful with a
  directed pointer to a specific package or module, not as a whole-repo read.
- [LiveStore](https://github.com/livestorejs/livestore) — reactive SQLite and
  sync engine across a package boundary; adapters for web, Cloudflare, and
  React show Effect carried through a published API surface.
- [alchemy](https://github.com/alchemy-run/alchemy) — infrastructure as
  Effects; published as the `alchemy-effect` package, and the repository
  formerly carried that name.

Focused references, small enough to read end to end:

- [effect-http-recorder](https://github.com/anomalyco/effect-http-recorder) —
  service definition, tagged errors, HTTP and socket clients, scoped resources.
- [browser-control](https://github.com/anomalyco/browser-control) — config and
  redaction, CLI, and platform integration at the edges of a plain-TypeScript
  core.
- [effect-local](https://github.com/lucas-barake/effect-local) — the broadest
  coverage available in a codebase still readable end to end: RPC, SQL,
  streams, layers, schema, `effect/testing`, observability, and async
  coordination in roughly 130 files.
- [dfx](https://github.com/tim-smart/dfx) — a published library rather than an
  application. Read it for library-authoring conventions: peer dependency
  ranges, module layout, and error channels at an API boundary.

## Guides

- **Model data** — schema boundaries, branded types, option, collections, date
  and time, optics.
- **Model failure** — error modeling, wrapping.
- **Structure the application** — services and layers, config.
- **Own lifetimes and concurrency** — resource safety, structured concurrency,
  iteration, async coordination, streams, request batching and cache, keyed
  resource sharing.
- **Integrate with platforms** — filesystem, HTTP API, HTTP client, Cloudflare
  Workers, SQL.
- **Operate and verify** — observability, testing.
