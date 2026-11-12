# @agentxm/extension-content

Reusable extension content behavior shared by the AXM client and the AgentXM
Registry: skill and subagent content parsing (`parseSkillMd`,
`parseSubagentMd`, frontmatter), manifest resolution and alignment, archive
guardrails, type-specific package validation, publish input normalization and
ingest limits (`.`); Knowledge bundle inspection and search (`./knowledge`);
the lint vocabulary, configuration, evaluator, and per-type rule catalog
(`./lint`); and deterministic zip builders for tests (`./testing`).

Dependency budget: `@agentxm/extension-model` only. It never depends on the
Registry protocol, workspace state, or any integration; consumers compose it
with those packages.

`validateArchive` returns an owned `ValidatedArchive`: its entry facts are
immutable and `copyBytes()` returns an independent byte array. Pass that value
in the `archive.content` field of `normalizePublishInput`, with the ZIP content
type, to reuse structural admission. Stronger limits are checked against the
admitted facts. Normalization
retains the typed manifest and shares built-in member reads within that one
inspection; custom readers receive independent byte copies and remain fresh
calls. Expanded content is not retained by the archive value.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
