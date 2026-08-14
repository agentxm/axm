---
type: Guide
title: Filesystem
description: Portable, typed, testable file operations; use when production code imports `node:fs` or `node:path` or walks directories.
tags: [effect, effect-v4, filesystem, path, platform, io, platform-error, testing]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-filesystem/src/SKILL.md
    title: effect-v4-filesystem skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
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
import { Effect, FileSystem, Path } from "effect"

const readText = (file: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* fs.readFileString(path.resolve(file))
  })
```

- Provide the platform layer once at the composition root. Do not import
  `node:fs` or `node:path` inside reusable production services.
- Resolve and normalize paths with `Path.Path`; do not assemble separators by
  string concatenation.
- Use platform-specific APIs only where that dependency is an explicit product
  requirement, not as the default implementation shortcut.

## Define the boundary

- Map `PlatformError` to the narrow domain failure at the feature boundary.
  Preserve the original cause and the operation/path context without exposing
  secret file contents.
- Decode file contents immediately after reading. Keep I/O failure distinct
  from parse or schema failure.
- Encode before writing, and define overwrite, atomicity, permissions, and
  parent-directory behavior explicitly.
- Use `{ recursive: true }` only when creating an existing ancestor is an
  accepted no-op; do not let it hide a wrong target path.
- Bound concurrent directory work with `Effect.forEach(..., { concurrency })`.
  Unlimited file descriptors are not a throughput strategy.

## Test without host coupling

- Provide a test `FileSystem`/`Path` layer or a controlled temporary directory.
- Assert domain behavior and resulting files, not private call order.
- If test setup uses Node APIs, keep that use outside the production Effect
  program and clean temporary resources with scoped acquisition.

## Review checklist

- Production I/O uses `FileSystem.FileSystem` and `Path.Path` services.
- Paths are computed by the Path service and remain within the intended root.
- Platform failures are translated once with useful operation context.
- Read/decode and encode/write failures remain distinguishable.
- Directory creation, overwrite, concurrency, and cleanup policies are explicit.
