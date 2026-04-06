---
name: "axm-manage-packs"
description: "Manage extension packs via the axm CLI — install, uninstall, new, add, remove, publish, unpack."
---

# Manage Extension Packs

Instructions for managing extension packs using the `axm` CLI.

## Install an Extension Pack

```bash
axm packs install @owner/pack-name
axm packs install @owner/pack-name@^2.0.0
axm packs install @owner/pack-name --preview
```

**Options:** `--scope <project|user>`, `--yes`, `--force`, `--preview`

## Uninstall an Extension Pack

```bash
axm packs uninstall @owner/pack-name
```

**Options:** `--yes`, `--preview`

## Create a New Extension Pack

```bash
axm packs new my-pack
axm packs new my-pack --profile @acme
```

**Options:** `--profile <profile>`, `--yes`

## Add Extension to Extension Pack

```bash
axm packs add my-pack @owner/skill-name
```

**Options:** `--yes`

## Remove Extension from Extension Pack

```bash
axm packs remove my-pack @owner/skill-name
```

**Options:** `--yes`

## Publish an Extension Pack

```bash
axm packs publish my-pack
axm packs publish my-pack --registry my-registry
```

**Options:** `--registry <name>`, `--yes`, `--preview`

## Unpack an Extension Pack

```bash
axm packs unpack @owner/pack-name
```

**Options:** `--yes`, `--preview`
