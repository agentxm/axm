# Contributing to `axm.sh`

## Compile Standalone Binaries

Prerequisites:

- Bun installed locally
- `pnpm install`

Run:

```sh
pnpm nx run cli:compile
```

The target depends on `cli:build`, compiles from `dist/src/main.js`, and writes binaries to `packages/cli/dist/bin/`:

- `axm-darwin-arm64`
- `axm-darwin-x64`
- `axm-linux-arm64`
- `axm-linux-x64`
- `axm-windows-x64.exe`

Each compile target owns a distinct output directory and clears it before writing, so a cached artifact set always matches the target that produced it:

| Target                 | Output directory             | Contents                                   |
| ---------------------- | ---------------------------- | ------------------------------------------ |
| `cli:compile`          | `packages/cli/dist/bin`      | every supported platform                   |
| `cli:compile-host`     | `packages/cli/dist/host-bin` | the host platform only                     |
| `cli:compile-host-dev` | `packages/cli/dist/dev-bin`  | the host platform only, dev version suffix |

Compile a host-only binary with `pnpm exec nx run cli:compile-host` rather than passing `--host-only` to `cli:compile`. The flag redirects the write to `dist/host-bin`, which `cli:compile` does not declare as an output, so `cli:compile` produces nothing in its declared `dist/bin` and caches an empty artifact set under the full-platform key.

The compile targets also inject the package version at build time so compiled binaries report the correct `axm --version`.
