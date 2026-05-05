# Getting started

axm manages agent extensions for a workspace: skills, commands, MCP servers,
subagents, and packs.

## Install

Install axm from the project release instructions, then confirm it is available:

```bash
axm --version
```

## Set up a workspace

Run setup in the project you want axm to manage:

```bash
axm setup
```

Setup creates `.axm/`, detects supported coding agents, and writes workspace
settings.

## Install an extension

Install from a registry reference:

```bash
axm install @acme/skills/code-review
```

Use `axm discover` to see extension suggestions for the current project.

## Key concepts

- A workspace is the project or user scope axm manages.
- A registry is a source of published extensions.
- A pack installs a curated set of extensions together.
