---
name: "axm-manage-packs"
description: "Manage extension packs via the axm CLI — install, uninstall, new, add, remove, publish, unpack."
---

# Manage Packs

Instructions for managing extension packs using the `axm` CLI.

## Install a Pack

```bash
axm packs install @scope/pack-name
axm packs install @scope/pack-name@^2.0.0
axm packs install @scope/pack-name --preview
```

**Options:** `--global`, `--yes`, `--force`, `--preview`

## Uninstall a Pack

```bash
axm packs uninstall @scope/pack-name
```

**Options:** `--yes`, `--preview`

## Create a New Pack

```bash
axm packs new my-pack
axm packs new my-pack --scope @acme
```

**Options:** `--scope <scope>`, `--yes`

## Add Extension to Pack

```bash
axm packs add my-pack @scope/skill-name
```

**Options:** `--yes`

## Remove Extension from Pack

```bash
axm packs remove my-pack @scope/skill-name
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
axm packs unpack @scope/pack-name
```

**Options:** `--yes`, `--preview`
