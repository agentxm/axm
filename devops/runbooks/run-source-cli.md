---
type: Runbook
title: "Run the AXM source CLI against a workspace"
description: "Select another workspace explicitly when running this checkout\u2019s source CLI, preserving toolchain and user-state boundaries."
status: draft
applies-to:
  - ../repositories/axm.md
  - ../environments/native-development.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Run the AXM source CLI against a workspace

## Preconditions and target

Prepare the checkout's dependencies through [CONTRIBUTING](../../CONTRIBUTING.md)
and identify the absolute target workspace and intended command. Read operations
and workspace mutations have different authority; authorize the selected command
before invoking it. From inside the checkout, use `pnpm run axm:local -C <workspace>`.

## Run the source CLI against another workspace

Use a location-independent source entrypoint with AXM's directory selector when
the CLI checkout and target workspace differ:

```bash
/path/to/axm/scripts/axm-local -C /path/to/workspace setup --yes
bun --conditions=axm-source /path/to/axm/apps/cli/src/main.ts -C /path/to/workspace list
```

Both entrypoints preserve the caller's working directory. `-C` / `--directory`
then selects the workspace before runtime initialization, and relative command
arguments resolve from that directory.

Neither entrypoint selects a registry. With `AXM_REGISTRY_LOCATION` unset the
CLI's own default applies; export it to target a local registry instead. The
`axm-local` wrapper also sets `AXM_TELEMETRY=0` when unset, because a source run
reports the plain package version and would otherwise be indistinguishable from
a release in telemetry; set it yourself when invoking `bun` directly.

```bash
# against the CLI's default registry
/path/to/axm/scripts/axm-local list

# against a local registry
AXM_REGISTRY_LOCATION=http://localhost:4300 /path/to/axm/scripts/axm-local list

# isolate AXM user state while preserving the shell/toolchain HOME
mkdir -p /tmp/axm-source-user
AXM_USER_HOME=/tmp/axm-source-user \
  AXM_REGISTRY_URL=http://localhost:4300 \
  /path/to/axm/scripts/axm-local -C /path/to/workspace list
```

`AXM_USER_HOME` relocates only AXM's user workspace and application resources;
it does not replace `HOME`, so Bun, pnpm, Git, and credential helpers continue
to resolve through the caller's normal toolchain environment. An HTTP(S)
`AXM_REGISTRY_LOCATION` selects both extension resolution and the Registry
service when `AXM_REGISTRY_URL` is absent. Set both only to the same origin;
different HTTP origins are rejected before a request.

Shell wrappers are the supported way to keep both forms on `PATH`; define them
in your own shell profile rather than in this repository.

These path forms are the one supported exception to invoking `axm:local` by its
published name, recorded in the
[Repository task interface](../../docs/guides/repository-task-interface.md#entrypoints-and-host-adapters):
outside the checkout there is no `pnpm` that resolves the name against AXM's
`package.json`. Inside the checkout, use `pnpm run axm:local -C <workspace>`.

Do not rely on `pnpm --dir /path/to/axm exec|run` to preserve the target: pnpm
changes into the AXM checkout before starting the command. If that invocation
form is necessary, pass `-C /path/to/workspace` explicitly.

If a mistaken invocation modifies the AXM source checkout, inspect and recover
that checkout with Git (`git -C /path/to/axm status` and a path-scoped
`git restore`). Do not run `axm adopt`; adoption changes extension authority and
does not restore repository files.

## Completion and recovery

Confirm the command result identifies the intended target and outcome; for a
mutation, inspect only the affected target workspace state and verify that the
source checkout retains its prior changes. Preserve command output and the
selected directory/registry as execution evidence without credentials.
Stop if selection, registry origin, or user-state isolation is uncertain.
For a mistaken target, inspect its diff before applying the path-scoped recovery
described above; do not discard unrelated work or use adoption as recovery.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The workspace operator owns the selected operation; repository maintainers support source launchers through CONTRIBUTING. No external workspace owner is assigned by this record.

Review this record when source launchers, directory selection, registry precedence, or user-state isolation changes.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
