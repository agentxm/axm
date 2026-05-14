# Go TinyFlags

This example shows how a Go module can ship companion AXM extensions for its
users. The module is a small feature flag library named
`github.com/agentxm/example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Go
module uses the `github.com/agentxm/*` module-path namespace.

The package ships AXM recommendations in an `axm.json` sidecar at the module
root:

```json
{
  "recommendedExtensions": ["@examples/packs/go-gomod-tinyflags@^0.1.0"]
}
```

When this module is added as a dependency in another project, `axm discover`
can read `$GOPATH/pkg/mod/github.com/agentxm/example-tinyflags@<version>/axm.json`
and surface the companion pack as a package-author recommendation.

A working consumer is in `../go-gomod-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── go.mod                      Go module manifest
├── axm.json                    Companion-extension recommendations
└── tinyflags/                  Library package and stdlib `testing` tests
```

## Build & test

```bash
go vet ./...
go test ./...
```

`go test` runs the standard-library `testing` suite under `tinyflags/`.

## Library

The library lives in `tinyflags/tinyflags.go` and exposes:

- `BooleanFlag(opts ...BooleanOption) (Flag, error)` and
  `VariantFlag(variants []string, opts ...VariantOption) (Flag, error)` —
  constructors that validate their inputs.
- `MustBooleanFlag` / `MustVariantFlag` — convenience wrappers that panic on
  invalid input. Intended for package-level flag tables.
- `New(definitions map[string]Flag) (*Flags, error)` — build a flag set.
- `Flags.Enabled(name, ctx)` — boolean evaluation.
- `Flags.Variant(name, ctx)` — variant evaluation.
- `Flags.Evaluate(name, ctx)` — kind-dispatched evaluation returning `Value`.
- `Context{ID string}` — caller identity used for deterministic bucketing.

```go
import "github.com/agentxm/example-tinyflags/tinyflags"

flags := tinyflags.MustNew(map[string]tinyflags.Flag{
    "checkoutRedesign": tinyflags.MustBooleanFlag(tinyflags.BoolDefault(true)),
    "searchRanking": tinyflags.MustVariantFlag(
        []string{"classic", "semantic"},
        tinyflags.VariantDefault("classic"),
        tinyflags.VariantRollout(map[string]int{"semantic": 100}),
    ),
})

ctx := tinyflags.Context{ID: "user-1"}
on, _ := flags.Enabled("checkoutRedesign", ctx)       // true
v,  _ := flags.Variant("searchRanking", ctx)          // "semantic"
val, _ := flags.Evaluate("searchRanking", ctx)        // Value{Kind: KindVariant, Variant: "semantic"}
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                  |
| -------- | ---------------------------------------------------- |
| Skill    | `@examples/skills/go-gomod-tinyflags-add-flag`       |
| Skill    | `@examples/skills/go-gomod-tinyflags-rollout-review` |
| Skill    | `@examples/skills/go-gomod-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/go-gomod-tinyflags-maintainer`  |
| Pack     | `@examples/packs/go-gomod-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:golang/github.com/agentxm/example-tinyflags` as its companion
package.

## Scenario

A framework or library author can use this layout as a model:

1. Implement the Go module as usual.
2. Ship an `axm.json` sidecar at the module root recommending the companion
   pack.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
