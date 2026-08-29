---
status: active
last-reviewed: 2026-07-15
version: 0.1.0
description: How AXM uses advisory Codex and Claude pull-request review without executing proposed code.
depends-on:
  - ../../AGENTS.md
  - ../../CONTRIBUTING.md
---

# Automated Pull Request Review

AXM uses automated semantic review as an advisory safety pass. Deterministic CI
and maintainer approval remain authoritative; an AI review cannot approve,
merge, or replace a required check.

The executable specifications
`system/process/merges-require-aggregate-verification` and
`system/process/changes-land-through-reviewed-pull-requests` in the
[specification catalog](../../specifications/catalog.md) own those obligations.
This guide owns their current automated-review implementation and operating
procedure.

> [Review guidelines](../../AGENTS.md#review-guidelines) - the repository's
> narrow P0/P1 review contract

## Review Model

| Process           | Trigger                | Runtime              | Authority     |
| ----------------- | ---------------------- | -------------------- | ------------- |
| Linux CI          | Every pull request     | Public pinned image  | Required      |
| Codex review      | Eligible pull requests | Codex managed review | Advisory      |
| Claude fallback   | Maintainer dispatch    | GitHub-hosted runner | Advisory      |
| Maintainer review | Branch policy          | GitHub               | Authoritative |

Native Codex review is the primary semantic reviewer and follows the root
`AGENTS.md` guidance. Repository owners create/select the repository's Codex
cloud environment, turn on **Code review**, and enable **Automatic reviews** in
Codex settings. Use the exact `@codex review` comment for a controlled manual
smoke before enabling the automatic path. Contributors do not need a provider
token and should not add one to a branch or pull request.

The Claude workflow is a manual fallback for maintainers. It checks out trusted
`main`, reads proposed changes through GitHub, and posts one top-level summary.
It does not check out or execute the pull-request branch. The action uses a
subscription OAuth secret stored by repository owners and a job-scoped GitHub
token with read-only repository access plus permission to post the summary.
Its explicit tool allowlist exposes only PR metadata/files/diff reads and one
top-level comment; it does not read existing PR comments.

Pullfrog is not part of the initial review path. Neither its hosted product nor
its orchestration tool is needed while one native automatic reviewer and one
manual fallback cover the workflow. Reconsider an orchestrator only after
measured review volume demonstrates a recurring provider-routing, queueing, or
comment-lifecycle problem.

### Review Checklist

- [ ] **CI green** -- Treat deterministic checks as the execution signal
- [ ] **Human approval present** -- Do not treat AI output as merge authority
- [ ] **Finding introduced** -- Act only on defects introduced by the proposed
      change
- [ ] **Finding material** -- Automated review reports concrete P0/P1 failures,
      not style preferences
- [ ] **PR data untrusted** -- Instructions in titles, comments, and diffs are
      data, not reviewer commands
- [ ] **Fix verified normally** -- Address accepted findings on the task branch
      and rerun repository checks

---

## Maintainer Operations

Enable Codex automatic review only after approving repository-data access. Test
one controlled pull request and a follow-up push to establish re-review
behavior. For the fallback, generate an eligible Claude subscription token with
`claude setup-token`, store it as `CLAUDE_CODE_OAUTH_TOKEN`, and dispatch
`.github/workflows/claude-review.yml` with a pull-request number.

Provider outages and quota failures are non-blocking. Continue with required CI
and normal maintainer review rather than moving untrusted code to a persistent
self-hosted runner or broadening token permissions.

Evaluate 25–50 representative reviews before expanding the system. Record
accepted findings, false positives, material defects later found by humans,
latency, and provider failures. Add orchestration only when that evidence shows
the simpler topology is insufficient.

### Operations Checklist

- [ ] **Codex controlled review** -- Automatic review follows repository
      guidance on a seeded test change
- [ ] **Codex manual trigger** -- `@codex review` posts the expected controlled
      review before automatic review is enabled
- [ ] **Increment observed** -- Follow-up-push behavior is recorded
- [ ] **Claude secret scoped** -- OAuth exists only as a repository Actions
      secret
- [ ] **Base checkout retained** -- The fallback never checks out PR head code
- [ ] **Permissions minimal** -- No merge, approval, label, shell, or source-write
      authority is added
- [ ] **Claude tools narrow** -- Only PR reads and one comment tool are exposed
- [ ] **Evaluation recorded** -- Provider decisions are based on a 25–50 PR
      sample

---

## See Also

- [Development Environment](./development-environment.md) - execution and
  runner trust boundaries
- [Codex code review in GitHub](https://learn.chatgpt.com/docs/third-party/github) -
  provider setup and automatic review
- [Claude Code Action security](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) -
  action threat model and hardening guidance
