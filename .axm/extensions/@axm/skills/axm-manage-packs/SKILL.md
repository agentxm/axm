---
name: "axm-manage-packs"
description: "Manage extension packs via the axm CLI — install, uninstall, new, add, remove, publish, unpack."
---

# Manage Packs

Instructions for managing extension packs using the `axm` CLI.

## Install a Pack

```bash
axm packs install @namespace/pack-name
axm packs install @namespace/pack-name@^2.0.0
axm packs install @namespace/pack-name --preview
```

**Options:** `--global`, `--yes`, `--force`, `--preview`

## Uninstall a Pack

```bash
axm packs uninstall @namespace/pack-name
```

**Options:** `--yes`, `--preview`

## Create a New Pack

```bash
axm packs new my-pack
axm packs new my-pack --namespace @acme
```

**Options:** `--namespace <namespace>`, `--yes`

## Add Extension to Pack

```bash
axm packs add my-pack @namespace/skill-name
```

**Options:** `--yes`

## Remove Extension from Pack

```bash
axm packs remove my-pack @namespace/skill-name
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
axm packs unpack @namespace/pack-name
```

**Options:** `--yes`, `--preview`
