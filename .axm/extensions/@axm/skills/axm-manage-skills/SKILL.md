---
name: "axm-manage-skills"
description: "Manage skills via the axm CLI — install, uninstall, list, update, enable, disable, fork, rename, publish."
---

# Manage Skills

Instructions for managing skills using the `axm` CLI.

## Install Skills

Install skills from GitHub, GitLab, Bitbucket, Azure Repos, git URL, or a local path.

```bash
axm skills install owner/repo              # GitHub shorthand
axm skills install owner/repo@v1.0.0       # Pinned ref
axm skills install ./path/to/skills        # Local path
axm skills install owner/repo --list       # List available skills
axm skills install owner/repo --all --yes  # Install all, skip prompts
axm skills install owner/repo --skill pr-review --agent claude-code
```

**Options:** `--global`, `--agent <id>...`, `--skill <name>...`, `--yes`, `--list`, `--all`, `--force`, `--preview`

## Uninstall Skills

```bash
axm skills uninstall my-skill
axm skills uninstall my-skill --agent claude-code
```

**Options:** `--agent <id>...`, `--yes`, `--preview`

## List Installed Skills

```bash
axm skills list
axm skills list --global
axm skills list --agent claude-code
```

Alias: `axm skills ls`

## Update Skills

```bash
axm skills update                   # Update all
axm skills update owner/repo        # Filter by source
axm skills update --skill pr-review # Filter by name/glob
axm skills update --force           # Force re-install
```

**Options:** `--global`, `--agent <id>...`, `--skill <name>...`, `--yes`, `--force`, `--preview`

## Enable / Disable Skills

```bash
axm skills enable my-skill
axm skills disable my-skill
```

**Options:** `--global`, `--yes`, `--preview`

## Fork a Skill

```bash
axm skills fork my-skill
axm skills fork my-skill --name custom-name
```

## Rename a Skill

```bash
axm skills rename old-name new-name
```

## Publish a Skill

```bash
axm skills publish my-skill
axm skills publish my-skill --registry my-registry
```

**Options:** `--registry <name>`, `--yes`, `--preview`
