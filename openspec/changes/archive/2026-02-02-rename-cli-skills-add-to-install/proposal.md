# Change: Rename cli-skills-add to cli-skills-install

## Why

The "add" terminology is inconsistent with common CLI conventions. Package managers
and extension systems use "install" (npm install, pip install, brew install,
vscode --install-extension). Using "install" aligns with user expectations and
industry standards.

## What Changes

- **BREAKING**: `axm skills add` becomes `axm skills install`
- Rename spec capability from `cli-skills-add` to `cli-skills-install`
- Rename command directory from `add/` to `install/`
- Update all references in specs, code, and tests

## Impact

- Affected specs: `cli-skills-add` (renamed to `cli-skills-install`)
- Affected code:
  - `packages/cli/src/commands/skills/add/` -> `packages/cli/src/commands/skills/install/`
  - `packages/cli/src/commands/skills/command.ts`
  - `packages/cli/src/main.ts`
  - `packages/cli/e2e/skills-add.test.ts` -> `packages/cli/e2e/skills-install.test.ts`
