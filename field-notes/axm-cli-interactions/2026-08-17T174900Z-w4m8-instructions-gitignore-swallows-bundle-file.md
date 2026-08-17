---
id: 2026-08-17T174900Z-w4m8
subject: axm-cli-interactions
key: instructions-gitignore-swallows-bundle-file
observed_at: "2026-08-17T17:49:00Z"
session: 3c515293-d28f-4b7e-a541-b8f8be721f20
kind: workaround
status: open
---

**Expected:** committing extensions materialized by `axm update` and `axm sync`
passes the pre-commit hook, which runs
`./scripts/axm-local lint --view git-index --strict`.

**Observed:** the hook failed with `knowledge/stale-index-entry` —
"skills/platforms/index.md links to missing bundle path claude.md" — for
`.axm/extensions/@agentxm/knowledge/agent-engineering/src/skills/platforms/index.md:11`.
The linked `claude.md` exists on disk, but `git add -A` never staged it: the
AXM-managed gitignore block emits `**/CLAUDE.md`, and with `core.ignorecase=true`
that pattern also matches the bundle's lowercase `claude.md`.

**Impact:** blocked the commit; required diagnosing an apparently-false lint
finding and one forced `git add -f` to proceed. Elapsed time not measured.

**Recovery:** `git add -f` on the single file, after which
`./scripts/axm-local lint --view git-index --strict` reported no findings and
the commit proceeded. The gitignore pattern itself is unchanged.

**Detected by:** husky pre-commit hook failure (exit 1) during `git commit`.

**Observed factors:**

- `.gitignore:56` contains `**/CLAUDE.md` inside the
  `# >>> axm:instructions >>>` / `# <<< axm:instructions <<<` managed block,
  generated from `rulesConfig.instructions.gitignoreAliases: true` in
  `.axm/settings.json`.
- `git check-ignore -v` attributes the exclusion to that line.
- `git config core.ignorecase` is `true` (macOS, APFS default).
- `find .axm/extensions -iname claude.md` matched exactly one file; no other
  vendored extension content collided with the pattern.
- The affected bundle is `@agentxm/knowledge/agent-engineering@0.3.0`, newly
  installed in this session as a member of
  `@agentxm/packs/agent-engineering@0.5.0`.

**Hypothesis:** the managed ignore pattern is written for the generated
instruction alias only, but `**/CLAUDE.md` is unanchored, so on a
case-insensitive filesystem it also excludes unrelated repository content whose
name differs only in case.

**Suggests:** anchor the generated pattern to the alias locations AXM actually
writes rather than a repo-wide `**/CLAUDE.md`, or exclude `.axm/extensions/`
from it, so vendored extension content is never swept up.

Evidence:

- `git check-ignore -v .axm/extensions/@agentxm/knowledge/agent-engineering/src/skills/platforms/claude.md`
  → `.gitignore:56	**/CLAUDE.md	...`
- Pre-commit output: `▲ ./.axm/extensions/@agentxm/knowledge/agent-engineering/src/skills/platforms/index.md:11  rule: knowledge/stale-index-entry`
- Directory listing of `src/skills/platforms/` shows `claude.md` present
  alongside `axm.md`, `copilot.md`, `gemini-cli.md`, `openai.md`.
