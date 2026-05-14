# R / CRAN TinyFlags

This example shows how a CRAN R package can ship companion AXM extensions for
its users. The package is a small R feature flag library named `tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The R
package itself uses the CRAN-style name `tinyflags`.

The `DESCRIPTION` file embeds AXM recommendations in a `Config/axm` field as
a JSON-encoded string — this is the format the AXM CRAN reader
(`packages/core/src/unstable/packaging/cran.ts`) parses:

```
Config/axm: {"recommendedExtensions": ["@examples/packs/r-cran-tinyflags@^0.1.0"]}
```

When this package is installed in another project, `axm discover` can read
that metadata from the installed package's `DESCRIPTION` and surface the
companion pack as a package-author recommendation.

A working consumer is in `../r-cran-app/` (the `pawmatch` CLI).

## Package

Targets R 4.0+. Tests use `testthat` (edition 3).

```bash
R CMD INSTALL .
Rscript -e 'testthat::test_local()'
```

Building and publishing:

```bash
# Build the source tarball locally:
R CMD build .

# TODO: configure CRAN publishing for tinyflags, then run:
# R CMD check tinyflags_0.1.0.tar.gz
```

The library lives in `R/` and exposes:

- `tf_bool(default, rollout = NULL)` — boolean flag constructor.
- `tf_variant(variants, default, rollout = NULL)` — variant flag constructor.
- `tf_registry(...)` — build a named registry of flag definitions.
- `tf_enabled(registry, name, context)`,
  `tf_variant_value(registry, name, context)`,
  `tf_evaluate(registry, name, context)` — evaluation.
- `tf_with_context(user_id, account_id, session_id)` — build an evaluation
  context.
- `tf_bucket(name, context)` — deterministic 0..99 bucket.

Flag objects are plain S3 lists with class attributes and validate inputs
on construction. Bucketing is deterministic by `user_id`, `account_id`, or
`session_id` from the evaluation context (SHA-1 over `"<flag>:<id>"`, modulo
100).

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                |
| -------- | -------------------------------------------------- |
| Skill    | `@examples/skills/r-cran-tinyflags-add-flag`       |
| Skill    | `@examples/skills/r-cran-tinyflags-rollout-review` |
| Skill    | `@examples/skills/r-cran-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/r-cran-tinyflags-maintainer`  |
| Pack     | `@examples/packs/r-cran-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each
manifest declares `pkg:cran/tinyflags@^0.1.0` as its companion package.

## Scenario

A CRAN package author can use this layout as a model:

1. Implement the normal R package (DESCRIPTION, NAMESPACE, `R/`).
2. Embed package-native AXM metadata in `DESCRIPTION` under the `Config/axm`
   field as a JSON-encoded string. Keep the JSON on a single line — CRAN's
   continuation-line rules allow line wraps, but a one-line JSON value is
   the simplest, most portable encoding.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
