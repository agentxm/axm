---
name: "axm-manage-packs"
description: "Manage extension packs via the axm CLI — install, uninstall, new, add, remove, publish, unpack."
---

# Manage Packs

Instructions for managing extension packs using the `axm` CLI.

## Install a Pack

```bash
axm packs install @profile/pack-name
axm packs install @profile/pack-name@^2.0.0
axm packs install @profile/pack-name --preview
```

**Options:** `--scope <project|user>`, `--yes`, `--force`, `--preview`

## Uninstall a Pack

```bash
axm packs uninstall @profile/pack-name
```

**Options:** `--yes`, `--preview`

## Create a New Pack

```bash
axm packs new my-pack
axm packs new my-pack --profile @acme
```

**Options:** `--profile <profile>`, `--yes`

## Add Extension to Pack

```bash
axm packs add my-pack @profile/skill-name
```

**Options:** `--yes`

## Remove Extension from Pack

```bash
axm packs remove my-pack @profile/skill-name
```

**Options:** `--yes`

## Publish a Pack

```bash
axm packs publish my-pack
axm packs publish my-pack --registry my-registry
```

**Options:** `--registry <name>`, `--yes`, `--preview`

## Unpack a Pack

```bash
axm packs unpack @profile/pack-name
```

**Options:** `--yes`, `--preview`
