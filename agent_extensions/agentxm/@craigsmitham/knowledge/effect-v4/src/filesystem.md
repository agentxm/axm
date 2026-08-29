---
type: Checklist
title: Filesystem
description: Evaluate whether file and path operations are portable, typed, containment-safe, resource-safe, and replaceable in tests.
tags: [effect, effect-v4, filesystem, path, platform, resource, testing]
status: stable
sources:
  - id: effect-filesystem
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/FileSystem.ts
    title: Effect 4.0.0-rc.112 FileSystem source
  - id: effect-path
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Path.ts
    title: Effect 4.0.0-rc.112 Path source
  - id: applied-alchemy
    resource: https://github.com/alchemy-run/alchemy/blob/ba579a98ea24b41cbf77a89ec8602fe071d5e43a/examples/fly-service/src/worker.ts
    title: Alchemy FileSystem service use at ba579a9
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Filesystem

- [ ] Depend on Effect's `FileSystem` and `Path` services in portable logic;
  provide the Node, Bun, or other platform implementation at the edge.
- [ ] Normalize, resolve, and validate untrusted path components before access,
  enforcing containment within the intended root.
- [ ] Keep not-found, permission, invalid-path, and I/O failures typed until the
  boundary that owns their domain meaning.
- [ ] Separate reading bytes or text from decoding the file's format so platform
  and schema failures remain distinguishable.
- [ ] Make overwrite, append, atomic replacement, durability, permissions, and
  directory-creation policy explicit for writes.
- [ ] Scope file handles, watchers, temporary files, and temporary directories
  so they close or disappear on failure and interruption.
- [ ] Avoid ambient current-directory assumptions when a stable base path can be
  configured or supplied.
- [ ] Test with a controlled filesystem layer, including traversal attempts,
  absent files, partial failure, cleanup, and platform-relevant path cases.

## Resources

- [FileSystem source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/FileSystem.ts)
- [Path source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Path.ts)
- [Applied FileSystem service in Alchemy](https://github.com/alchemy-run/alchemy/blob/ba579a98ea24b41cbf77a89ec8602fe071d5e43a/examples/fly-service/src/worker.ts)
