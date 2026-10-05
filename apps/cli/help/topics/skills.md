# Skills

Before distributing package-root files, read `axm help publish` for the
Registry-only archive policy and effective preview.

Project-authored skill packages live in `./skills/<package-name>`; acquired skills
use source-addressed retained packages. A Registry skill
such as `@acme/skills/review` lives at
`./agent_extensions/registry.agentxm.ai/@acme/skills/review`; a portable GitHub skill at
`github:remix-run/react-router//.agents/skills/react-router@main` lives at
`./agent_extensions/github.com/remix-run/react-router/.agents/skills/react-router`.

## Install existing distributions

Install from an existing Git repository, local directory, HTTPS `SKILL.md`,
ZIP/tar artifact, or supported well-known discovery index. Select a skill by
its name or exact source-relative path. Unknown frontmatter remains unchanged;
external acquisition does not require an AXM manifest or authoring conformance.

```sh
axm install ./upstream --skill skills/review --agent claude-code
axm skills install https://example.com/review/SKILL.md --agent claude-code
```

On first install, `--agent` establishes workspace destinations. Repeat it for
each agent. Existing workspaces keep their configured destinations. This path
does not require setup, Registry sign-in, bundled skills, or instruction-file
synchronization. Use `--preview` to inspect the operation first.

Plugin skills retain their package context, including inactive siblings and
shared assets. A selected skill that relies on content outside its own directory
requires directory-link support; AXM refuses a copy fallback that would lose
that context. Standalone skills support faithful copies, including contained
relative links and executable files. Preserved plugin hooks and other runtime
components are not automatically activated.

## skill.json

[`skill.json`](https://axm.sh/schemas/skill.schema.json)

Run `axm help skill-schema` to print the raw JSON Schema.

## `src/`

For an AgentXM skill package, the `src/` directory holds `SKILL.md` and any
other files described by the [agentskills.io](https://agentskills.io)
specification. A portable Agent Skill acquired directly from Git or a local
source is preserved exactly at its selected source path: `SKILL.md`,
`references/`, and other sibling content remain at that canonical root, and AXM
does not fabricate `skill.json` or a publisher identity.

`skill.json.name` identifies the AXM package; the existing `SKILL.md`
frontmatter `name` determines its agent-facing directory. They may differ.
When the declared name is missing or unusable as a safe path component, AXM
uses the selected source or package name, never `src`. It does not rewrite
frontmatter during import, fork, publication, or installation.

Every agent receives the same skill content. Native fields, `agentOverrides`,
conditional text, and tool names remain literal; AXM has no per-agent skill
renderer. Unknown metadata alone does not cause a routine warning or error.

To request strict Agent Skills conformance in `axm lint`, configure:

```json
{
  "lint": {
    "rules": {
      "skill/frontmatter-parseable": "error",
      "skill/frontmatter-standard-valid": "error"
    }
  }
}
```

These checks are opt-in for both acquired and authored content. AXM manifest,
entry-point, integrity, and ownership checks remain enabled independently.

## File references

Within one skill, reference supporting files relative to the skill root (the
package's `src/` directory). Use forward-slash paths that an agent can open
directly:

```markdown
Read `references/policy.md`, then run `scripts/validate.sh`.
```

Do not use absolute machine paths or agent-specific projections such as
`.agents/skills` or `.claude/skills`. A skill never references another
extension's files by path in any form. Name the required sibling by its
extension identity and let the agent resolve it through its own discovery.

## Writing the `description` for model invocation

The `SKILL.md` frontmatter `description` is the single biggest lever on whether
a skill actually fires. When a skill is model-invocable, the agent matches this
text against the current task to decide whether to load it. Write it for the
model, not for a human catalog — this is a different job from the registry-facing
manifest `description` (see `axm help authoring`).

- **Write in the third person and lead with what it does**, then add a `Use
when…` clause naming concrete triggers: the task verbs, file types, tools, or
  keywords a matching request will contain.
- **Include the literal terms** a user would actually type. The model matches on
  overlap, so name the technology and the action.
- **State when _not_ to use it** if the skill could over-fire on adjacent tasks.

```yaml
---
name: review-typescript
description: Reviews TypeScript diffs for Effect idioms and common bugs. Use when the user asks to review, audit, or check `.ts`/`.tsx` changes. Not for runtime debugging or test authoring.
---
```

Weaker: `description: Helps with code.` — no triggers, so the model rarely
knows when to load it.

Invocation behavior outside the standard frontmatter is agent-specific. Keep
author-provided native configuration intact. AXM preserves these fields without
claiming that every agent implements them.

## Authoring and editing skills

The contents of `src/` are symlinked by AXM into each configured agent's skill directory, so you do not need to run `axm sync` after an edit. Run `axm sync` after changing the declared skill name or when links or copies need reconciliation.

If AXM had to copy a skill because symlinks are unavailable, edit `src/SKILL.md`
in its authored package and run `axm sync`; do not edit the copied agent-side
file. Acquired packages are immutable accepted state—fork one before editing it.

## Unmanaged skills

Agent-native skills without AXM ownership remain outside reconciliation. Choose one resolution per skill or related group:

- **Transfer management** for an existing Skills-manager installation: `axm skills handoff --skill review --agent claude-code --preview`, then repeat without `--preview` to apply.
- **Install** from an upstream source when the destination is free: `axm skills install <source>`. Ordinary install does not take over foreign content.
- **Import** unmanaged/native content when you want to own, customize, or publish it: `axm skills import <source> <extension>`, then `axm skills publish`.
- **Fork** an existing managed AXM skill when you want a separately authored derivative: `axm fork <source> <extension>`.
- **Leave it unowned** when another tool owns its lifecycle. AXM does not delete it.

Import only when you deliberately create an AXM-owned copy. The native source
remains unchanged. Sync removes obsolete output only when the projection
adapter proves unit-local AXM ownership; unknown artifacts are retained.

Handoff reads project `skills-lock.json` version 1 or user `.skill-lock.json`
version 3. User discovery uses `$XDG_STATE_HOME/skills/.skill-lock.json` when
nonempty, otherwise `~/.agents/.skill-lock.json`. Use `--scope user` for user
installations or `--lock <path>` for an explicit manager lock. Repeat `--skill`
to select entries; `--all` selects every entry for verification. An unverifiable
selection stops the transfer. Local edits and unrelated manager records remain
untouched. AXM retains upstream tracking and does not turn the skill into
authored content. Folder hashes are never interpreted as historical commits.

## Lockfile and integrity

AXM records accepted immutable resolution for externally sourced skills:

- **`integrity`** — the SRI sha512 of the published archive. AXM verifies it against the downloaded bytes before extracting, every time it fetches. This is the supply-chain guarantee: a tampered or corrupted download fails the install.
- **Git identity** — source URL, optional selected path and revision, plus immutable commit and tree identities.
- **Local-source identity** — workspace-relative locator and immutable tree identity for an accepted local source.
- **HTTPS artifact identity** — exact downloaded SHA-256 digests, separate from
  the materialized tree. Reinstall and restoration use those accepted artifacts;
  explicit update resolves the source again.

After install, remote-source canonical files under `agent_extensions/` are
observed materialization. Lockfile v11 records each retained package snapshot once and binds selected
components to it. Its strict `treeIntegrity` covers the complete package tree. If any
path or byte changes locally, AXM preserves the
drift and blocks affected lint, inspection, reconciliation, projection, and
lifecycle work until reinstall, update, or fork resolves it. Workspace-authored
packages remain local authority.

## Recommended packs

Name the pack(s) your skill is designed to ship with in `skill.json` `recommendedPacks`. Use the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this skill as a dependency and the skill lists that pack as recommended, the registry marks both sides of the relationship as **official**. Either side may declare alone; the badge appears only when both agree.

Always declare `recommendedPacks` for packs you publish under the same owner that bundle this skill — it costs nothing and earns the Official badge in the registry.

Keep the skill self-contained. `recommendedPacks` does not install the pack or
its members. If the skill requires another extension, name that sibling by its
extension identity and let the agent resolve it through its own discovery —
never by file path. See `axm help packs` for pack composition.

## Where to go next

- `axm skills --help` — full skill subcommand surface
- `axm help authoring` — writing the registry `description`, keywords, and README
- `axm help packs` — bundling skill extensions with extension packs
- `axm help workspace-state` — desired, accepted-resolution, and observed semantics
