# Contributing to `axm.sh`

## Compile Standalone Binaries

Prerequisites:

- Bun installed locally
- `pnpm install`

Run:

```sh
pnpm exec nx run cli:compile
```

The aggregate target runs the five platform compile targets. Each depends on `cli:build`, compiles from `dist/src/main.js`, and owns one binary in `apps/cli/dist/bin/`:

- `axm-darwin-arm64`
- `axm-darwin-x64`
- `axm-linux-arm64`
- `axm-linux-x64`
- `axm-windows-x64.exe`

Each platform producer is independently cached and replaces only its own binary. Host and development targets own separate directories:

| Target                   | Output directory         | Contents                                   |
| ------------------------ | ------------------------ | ------------------------------------------ |
| `cli:compile`            | —                        | orchestrates every supported platform      |
| `cli:compile-<platform>` | `apps/cli/dist/bin`      | one release binary                         |
| `cli:compile-host`       | `apps/cli/dist/host-bin` | the host platform only                     |
| `cli:compile-host-dev`   | `apps/cli/dist/dev-bin`  | the host platform only, dev version suffix |

Use `pnpm exec nx run cli:compile-host` for a host-only binary. To produce one release asset, use its platform target, for example `pnpm exec nx run cli:compile-linux-x64`. Development compilation runs fresh because its version includes Git state. The [repository task interface](../../docs/guides/repository-task-interface.md) owns cache and verification semantics.

The compile targets also inject the package version at build time so compiled binaries report the correct `axm --version`.
