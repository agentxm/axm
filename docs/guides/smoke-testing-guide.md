# Smoke Testing Guide

## Install Smoke

Use this smoke when checking install behavior against a local registry-backed
workspace.

1. In a publisher workspace, run `axm init --yes --agent claude-code`.
2. Add a local registry source in `.axm/settings.json`:
   `{"name":"local","type":"registry","location":"file:///tmp/axm-registry"}` and set `profile` to `@test`.
3. Publish one or more extensions, for example:
   `axm skills new smoke-skill --profile @test --agent claude-code --yes`
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
