---
type: Guide
title: Filesystem
description: Portable, typed, testable file operations through the core FileSystem and Path services; use when production code imports `node:fs` or `node:path`, walks directories, or must choose a platform layer.
tags: [effect, effect-v4, filesystem, path, platform, io, platform-error, testing]
status: stable
sources:
  - id: src-filesystem
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/FileSystem.ts
    title: FileSystem module source — core service, readFileString, makeDirectory, scoped temp resources, layerNoop/makeNoop (effect 4.0.0-rc.111)
  - id: src-path
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Path.ts
    title: Path module source — core service and built-in POSIX Path.layer (effect 4.0.0-rc.111)
  - id: src-platform-error
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/PlatformError.ts
    title: PlatformError module source — reason-structured failure with module/method/path context (effect 4.0.0-rc.111)
  - id: src-node-filesystem
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/platform/node/src/NodeFileSystem.ts
    title: "@effect/platform-node source — NodeFileSystem.layer, with NodePath and NodeServices siblings (effect 4.0.0-rc.111)"
  - id: test-filesystem-conformance
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/FileSystem.test-utils.ts
    title: Shared FileSystem conformance tests run against every platform layer (effect 4.0.0-rc.111)
  - id: applied-browser-control
    resource: https://github.com/anomalyco/browser-control/blob/0110939f584362df2cba1f4f167dc5867c7f6e27/src/session-store.ts
    title: browser-control@0110939 — one-time PlatformError translation with operation context and composition-root NodeServices.layer
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/fs-util.ts
    title: opencode@2cba7e2 — NodeFileSystem.layer/NodePath.layer bound at the root and reason-narrow NotFound recovery
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-filesystem/src/SKILL.md
    title: effect-v4-filesystem skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:53Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Filesystem

Keep filesystem and path capabilities in the Effect environment so platform
choice, failure mapping, and tests remain at the boundary.

**Applies when** production code imports `node:fs` or `node:path`, performs
read-parse-write workflows, walks directories, maps platform failures, or needs
filesystem test doubles.

**Leave alone** build scripts intentionally owned by a platform-specific
toolchain.

Related: [Services and layers](services-and-layers.md) for providing the
platform layer, [Error modeling](error-modeling.md) for translating
`PlatformError`, [Schema boundaries](schema-boundaries.md) for decoding file
contents.

## Acquire platform services

```ts
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";

const readText = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.resolve(file));
  });

// Composition root: the only place that names a platform package.
const main = readText("app.json").pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer]));
```

- `FileSystem`, `Path`, and `PlatformError` are core `effect` modules;
  concrete implementations stay in platform packages.[^src-filesystem]
- Provide the platform layer once at the composition root:
  `NodeFileSystem.layer` and `NodePath.layer` from `@effect/platform-node`, or
  `NodeServices.layer` when the program wants the standard platform services
  from one place. `@effect/platform-bun` and `@effect/platform-deno` ship the
  same shape (`BunFileSystem.layer`, `DenoFileSystem.layer`, and their
  `*Services.layer` bundles).[^src-node-filesystem] [^applied-opencode]
- Pure path computation needs no platform package: core `Path.layer` provides
  the built-in POSIX implementation.[^src-path]
- Do not import `node:fs` or `node:path` inside reusable production services.
- Resolve and normalize paths with `Path.Path`; do not assemble separators by
  string concatenation.
- Use platform-specific APIs only where that dependency is an explicit product
  requirement, not as the default implementation shortcut.

## Define the boundary

- Map `PlatformError` to the narrow domain failure at the feature boundary.
  Preserve the original cause and the operation/path context without exposing
  secret file contents.[^src-platform-error] [^applied-browser-control]
- Decode file contents immediately after reading. Keep I/O failure distinct
  from parse or schema failure.
- Encode before writing, and define overwrite, atomicity, permissions, and
  parent-directory behavior explicitly.
- Use `{ recursive: true }` only when creating an existing ancestor is an
  accepted no-op; do not let it hide a wrong target path.
- Bound concurrent directory work with `Effect.forEach(..., { concurrency })`.
  Unlimited file descriptors are not a throughput strategy.

## Test without host coupling

- Stub only the operations a test needs with `FileSystem.layerNoop({ ... })`
  (or `makeNoop` for a bare service): unstubbed operations fail with
  `NotFound` or die, so accidental host I/O stays loud.[^src-filesystem]
- Provide core `Path.layer`, or `Layer.succeed(Path.Path)(custom)` when path
  behavior itself is under test.[^src-path]
- Alternatively use a controlled temporary directory with a real platform
  layer.
- Assert domain behavior and resulting files, not private call
  order.[^test-filesystem-conformance]
- If test setup uses Node APIs, keep that use outside the production Effect
  program and clean temporary resources with scoped acquisition
  (`makeTempDirectoryScoped`, `makeTempFileScoped`).[^src-filesystem]

## Review checklist

- Production I/O uses `FileSystem.FileSystem` and `Path.Path` services.
- A platform package is named only at the composition root, and tests
  substitute through the same service keys.
- Paths are computed by the Path service and remain within the intended root.
- Platform failures are translated once with useful operation context.
- Read/decode and encode/write failures remain distinguishable.
- Directory creation, overwrite, concurrency, and cleanup policies are explicit.

[^src-filesystem]: `packages/effect/src/FileSystem.ts` at `effect@4.0.0-rc.111` — core `Context.Service`, `layerNoop`/`makeNoop` defaults, and `makeTempDirectoryScoped`/`makeTempFileScoped`; the module header states platform packages provide the concrete layers.

[^src-path]: `packages/effect/src/Path.ts` at `effect@4.0.0-rc.111` — `Path.layer` is the built-in POSIX implementation; the service doc shows `Layer.succeed(Path.Path)(custom)`.

[^src-platform-error]: `packages/effect/src/PlatformError.ts` at `effect@4.0.0-rc.111` — wraps a `BadArgument | SystemError` reason carrying module, method, path, and cause.

[^src-node-filesystem]: `packages/platform/node/src/NodeFileSystem.ts`, `NodePath.ts`, `NodeServices.ts` at `effect@4.0.0-rc.111`; Bun and Deno equivalents in `packages/platform/{bun,deno}/src`.

[^test-filesystem-conformance]: `packages/effect/test/FileSystem.test-utils.ts` at `effect@4.0.0-rc.111` — shared behavioral suite run against each platform layer.

[^applied-browser-control]: Observed in browser-control@0110939 `src/session-store.ts` and `src/cli.ts` (effect 4.0.0-beta.97).

[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/fs-util.ts` and `packages/core/src/effect/app-node-platform.ts` (effect 4.0.0-beta.83).
