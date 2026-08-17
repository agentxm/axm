---
type: Guide
status: stable
description: Repository-specific manual verification across the AXM CLI and registry boundary.
---

# Smoke Testing Guide

## Install Smoke

Use this smoke when checking install behavior against a local registry-backed
workspace.

1. In a publisher workspace, run `axm setup --yes --agent claude-code`.
2. Add a local registry source in `.axm/settings.json`:
   `{"name":"local","type":"registry","location":"file:///tmp/axm-registry"}` and set `owner` to `@test`.
3. Publish one or more extensions, for example:
   `axm skills new smoke-skill --owner @test --agent claude-code --yes`
   `axm skills publish @test/skills/smoke-skill --yes`
4. In a fresh workspace with the same registry source:
   - Sourceful root install: `axm install @test/skills/smoke-skill --yes`
   - No-arg typed install: add `skills.smoke-skill = "@test/skills/smoke-skill"` to `.axm/settings.json`, then run `axm skills install --yes`
   - No-arg root install: declare one or more configured entries in `.axm/settings.json`, then run `axm install --yes`
5. Verify:
   - `.axm/settings.json` contains the configured direct entries
   - `.axm/axm-lock.yaml` contains installed entries for the configured workspace state
   - `.axm/extensions/@test/.../` exists for the installed extensions
   - `axm install --help` documents the no-arg workspace behavior plus the root FQN contract

## Uninstall Smoke

Use this smoke when checking root uninstall routing against a local
registry-backed workspace.

1. Start from a workspace where one or more registry extensions are already
   installed.
2. Run a root uninstall such as:
   - `axm uninstall @test/skills/smoke-skill --yes`
   - `axm uninstall @test/packs/smoke-pack@1.0.0 --preview`
3. Verify:
   - the matching typed uninstall behavior is preserved for the target type
   - version suffixes on root uninstall inputs are ignored for routing
   - `axm uninstall --help` documents the registry FQN requirement
