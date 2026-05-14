# Zig TinyFlags

This example shows how a Zig package can ship companion AXM extensions for its
users. The package is a small feature-flag library named
`agentxm_example_tinyflags` and is imported as `tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Zig
package uses the `agentxm_example_*` distribution-name prefix (Zig package
names are plain-ascii identifiers, so dashes are not used).

The package ships AXM recommendations in an `axm.json` sidecar at the package
root, listed in `build.zig.zon`'s `.paths` array so it travels with the
published archive:

```json
{
  "recommendedExtensions": ["@examples/packs/zig-zon-tinyflags@^0.1.0"]
}
```

When this package is added as a dependency, `axm discover` can read
`~/.cache/zig/p/<hash>/axm.json` and surface the companion pack as a
package-author recommendation. The reader does a best-effort scan of the
cache because Zig uses content-addressed hashes rather than named cache
directories.

A working consumer is in `../zig-zon-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── build.zig                      Zig build script
├── build.zig.zon                  Package manifest with .paths listing axm.json
├── axm.json                       Companion-extension recommendations
└── src/                           Library sources with in-file `test "..."` blocks
    └── tinyflags.zig
```

## Build & test

```bash
zig build
zig build test
```

`zig build test` runs the inline `test "..."` blocks declared in
`src/tinyflags.zig`.

## Library

The library exposes:

- `Flag.booleanDefault(default)` / `Flag.booleanRollout(default, rollout)` —
  boolean flag constructors.
- `Flag.variantDefault(allocator, variants, default)` /
  `Flag.variantWithRollout(allocator, variants, default, rollout)` — variant
  flag constructors.
- `Registry.init(allocator, entries)` — assemble the named flag set.
- `Registry.enabled(name, ctx)` — boolean evaluation.
- `Registry.variant(name, ctx)` — variant evaluation.
- `Registry.evaluate(name, ctx)` — kind-dispatched evaluation returning a
  `Value`.
- `Context.init(id)` — caller identity used for deterministic bucketing.

```zig
const std = @import("std");
const tf = @import("tinyflags");

var registry = try tf.Registry.init(allocator, &.{
    .{ .name = "checkout-redesign", .flag = tf.Flag.booleanDefault(true) },
    .{
        .name = "search-ranking",
        .flag = try tf.Flag.variantWithRollout(
            allocator,
            &.{ "classic", "semantic" },
            "classic",
            &.{ .{ .name = "semantic", .percentage = 100 } },
        ),
    },
});
defer registry.deinit();

const ctx = tf.Context.init("user-1");
const on = try registry.enabled("checkout-redesign", ctx); // true
const v  = try registry.variant("search-ranking", ctx);    // "semantic"
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                |
| -------- | -------------------------------------------------- |
| Skill    | `@examples/skills/zig-zon-tinyflags-add-flag`      |
| Skill    | `@examples/skills/zig-zon-tinyflags-rollout-review`|
| Skill    | `@examples/skills/zig-zon-tinyflags-cleanup-flag`  |
| Subagent | `@examples/subagents/zig-zon-tinyflags-maintainer` |
| Pack     | `@examples/packs/zig-zon-tinyflags`                |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:generic/zig/agentxm_example_tinyflags` as its companion
package. Zig purls are versionless because the package manifest carries its
URL and hash rather than a version.

## Scenario

A Zig package author can use this layout as a model:

1. Implement the normal Zig package.
2. Add an `axm.json` sidecar at the package root recommending the companion
   pack.
3. Add `axm.json` to the `.paths` array in `build.zig.zon` so it travels with
   the published archive and lands in `~/.cache/zig/p/<hash>/axm.json`.
4. Add AXM extension sources in `.axm/extensions/<owner>/`.
5. Mark the extensions as authored in `.axm/settings.json`.
6. Publish the extensions independently or as a companion pack.
