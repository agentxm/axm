# Haskell / Hackage TinyFlags

This example shows how a Hackage package can ship companion AXM extensions
for its users. The package is a small Haskell feature-flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The
package itself uses the Hackage name `agentxm-example-tinyflags`.

The `.cabal` file embeds AXM recommendations as `x-axm-<field>` custom
fields. The Hackage reader parses each `x-axm-` line and JSON-decodes the
value:

```cabal
x-axm-recommendedExtensions: ["@examples/packs/haskell-hackage-tinyflags@^0.1.0"]
```

When this package is installed in another project, `axm discover` can read
that metadata from the installed `.cabal` file (in `~/.cabal/store/` or
`dist-newstyle/`) and surface the companion pack as a package-author
recommendation.

A working consumer is in `../haskell-hackage-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── agentxm-example-tinyflags.cabal   Cabal manifest (with x-axm-* fields)
├── cabal.project                     Single-package cabal project
├── src/AgentXM/Example/TinyFlags.hs  Public API
└── test/Spec.hs                      Hspec test suite
```

## Build & test

Uses [cabal-install](https://www.haskell.org/cabal/), not Stack.

```bash
cabal update
cabal build
cabal test
```

## Library

The library lives in `src/AgentXM/Example/TinyFlags.hs` and exposes:

- `booleanFlag :: Bool -> Maybe Int -> Either TinyFlagsError BooleanFlag` —
  boolean flag with an explicit default and an optional rollout percentage.
- `variantFlag :: [Text] -> Text -> Maybe [(Text, Int)] -> Either TinyFlagsError VariantFlag` —
  variant flag with an allow-list, a default, and an optional rollout map.
- `registry :: [(Text, Flag)] -> Registry` — frozen flag set.
- `enabled`, `variant`, `evaluate` — evaluate a flag against a `Context`.

All smart constructors return `Either TinyFlagsError`. Bucketing is
deterministic by `ctxUserId`, `ctxAccountId`, or `ctxSessionId` from the
evaluation `Context`.

```haskell
import AgentXM.Example.TinyFlags

Right checkout <- pure $ booleanFlag True Nothing
Right ranking  <- pure $ variantFlag ["classic", "semantic"] "classic"
                          (Just [("semantic", 100)])

let flags = registry
      [ ("checkout-redesign", FBool checkout)
      , ("search-ranking",    FVariant ranking)
      ]
    ctx = anonymousContext { ctxUserId = Just "user-1" }

enabled flags "checkout-redesign" ctx   -- Right True
variant flags "search-ranking" ctx      -- Right "semantic"
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                         |
| -------- | ----------------------------------------------------------- |
| Skill    | `@examples/skills/haskell-hackage-tinyflags-add-flag`       |
| Skill    | `@examples/skills/haskell-hackage-tinyflags-rollout-review` |
| Skill    | `@examples/skills/haskell-hackage-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/haskell-hackage-tinyflags-maintainer`  |
| Pack     | `@examples/packs/haskell-hackage-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each
manifest declares `pkg:hackage/agentxm-example-tinyflags@^0.1.0` as its
companion package.

## Scenario

A Hackage package author can use this layout as a model:

1. Implement the normal Haskell library.
2. Embed package-native AXM metadata in the `.cabal` file as
   `x-axm-<field>: <json>` custom fields. Each value is JSON-decoded by
   the AXM Hackage reader.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
