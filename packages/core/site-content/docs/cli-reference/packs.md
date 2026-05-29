---
title: axm packs
description: Manage extension bundles.
---

# axm packs

Manage extension bundles.

## When to use

Use this command family when composing or installing groups of related extensions together.

## Usage

```bash
axm packs <subcommand> [flags]
```

## Arguments

None.

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**Add a curated set of extensions to your agents**

```bash
axm packs install @acme/packs/frontend-tools
```

**Create a new pack to bundle your extensions**

```bash
axm packs new my-pack
```

**Add extensions to your pack**

```bash
axm packs add my-pack @acme/skills/code-review
```

**Share your pack on the registry**

```bash
axm packs publish @acme/packs/frontend-tools
```

**Bump a pack version**

```bash
axm packs version @acme/packs/frontend-tools patch
```

## Subcommands

| Command                                     | Summary                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [axm packs list](#axm-packs-list)           | List installed packs                                                                                |
| [axm packs install](#axm-packs-install)     | Reinstall configured packs from their sources, or install a pack and its extensions from a registry |
| [axm packs uninstall](#axm-packs-uninstall) | Uninstall a pack                                                                                    |
| [axm packs new](#axm-packs-new)             | Create a new empty pack                                                                             |
| [axm packs add](#axm-packs-add)             | Add an extension to a pack manifest                                                                 |
| [axm packs remove](#axm-packs-remove)       | Remove an extension from a pack manifest                                                            |
| [axm packs publish](#axm-packs-publish)     | Publish a pack to a registry                                                                        |
| [axm packs unpack](#axm-packs-unpack)       | Eject pack into individual entries                                                                  |
| [axm packs version](#axm-packs-version)     | Bump a managed pack manifest version                                                                |

### axm packs list

List installed packs

```bash
axm packs list [flags]
```

### axm packs install

Reinstall configured packs from their sources, or install a pack and its extensions from a registry

```bash
axm packs install [flags] [<source>]
```

### axm packs uninstall

Uninstall a pack

```bash
axm packs uninstall [flags] <name>
```

### axm packs new

Create a new empty pack

```bash
axm packs new [flags] <name>
```

### axm packs add

Add an extension to a pack manifest

```bash
axm packs add [flags] <pack> <extension>
```

### axm packs remove

Remove an extension from a pack manifest

```bash
axm packs remove [flags] <pack> <extension>
```

### axm packs publish

Publish a pack to a registry

```bash
axm packs publish [flags] <pack>
```

### axm packs unpack

Eject pack into individual entries

```bash
axm packs unpack [flags] <name>
```

### axm packs version

Bump a managed pack manifest version

```bash
axm packs version [flags] <handle> <bump> [<version>]
```

## Requirements

- workspace

## Side effects

None.
