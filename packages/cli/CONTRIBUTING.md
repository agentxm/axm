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

The compile target also injects the package version at build time so compiled binaries report the correct `axm --version`.
