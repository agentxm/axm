---
observed_at: "2026-10-02T20:19:33.965998+00:00"
session: "k9q2"
area: "axm-cli-interactions"
---

# Git skill discovery previews silently omit upstream skills

## Context

Assessing AXM 0.38.0 as an alternative procurement route for basecamp/skills,
mattpocock/skills, and cursor/plugins/pstack. Commands used preview mode only.

## Friction

`axm install basecamp/skills --all --preview --json --non-interactive` exited 0
with one ready unit, `basecamp-doctor`, and zero warnings. Selecting `--skill
basecamp` instead exited 3: `No skills matched: basecamp. Source contains:
basecamp-doctor`.

`axm install https://github.com/cursor/plugins/tree/main/pstack --all --preview
--json --non-interactive` also exited 0 with one ready unit, `setup-pstack`, and
zero warnings. Selecting `--skill poteto-mode` exited 3: `No skills matched:
poteto-mode. Source contains: setup-pstack`.

## Cost / impact

Successful bulk previews did not disclose omitted upstream skills. Explicit
selection previews and source inspection were needed to distinguish discovery
coverage from complete source installation.

## Outcome

No extensions were installed. The assessment retains the observed partial
coverage rather than treating successful previews as drop-in compatibility.

## Evidence

The live Basecamp skill includes `triggers`, `invocable`, and `argument-hint`.
Pstack's poteto-mode frontmatter includes `name: Poteto Mode`,
`disable-model-invocation`, `mode`, `icon`, `color`, and `reminder`.

AXM source inspection at cli-v0.38.0 found that
`packages/core/extension-content/src/content/skill-content.ts` rejects
unsupported frontmatter keys and returns no parsed skill for invalid metadata;
`packages/core/workspace-kernel/src/sources/package-discovery.ts` skips that
result during portable Git discovery.
