# AXM

AXM is the Agent Extension Manager CLI for coding agents.

<!-- axm:generated:extension-type-list -->

AXM manages skills, MCP servers, subagents, rules, hooks, knowledge bundles, and packs.

<!-- /axm:generated -->

> AXM is in early alpha. Commands and contracts may change.

## Install

```bash
npm install --global axm.sh
```

Other installers and current platform support are documented at
[axm.sh](https://axm.sh).

## Start

```bash
axm setup
axm discover
axm install @owner/skills/example
axm list
```

Use `axm --help`, `axm <command> --help`, and `axm help` for the shipped command
and topic reference.

## Programmatic API

The `axm.sh/app` and `axm.sh/runtime` exports are experimental. `run()` is a
process entry point that supports one invocation per process. It owns stdout,
stderr, and signal handlers for that invocation, and terminates the process on
failure. Repeated, concurrent, and Worker-hosted invocation are unsupported.

`rootCommand` is available for structural inspection and composition under the
same experimental API contract. No persistent or re-entrant application
lifecycle is provided.

## Source

The public source, contribution workflow, architecture, and release history live
in the [AXM repository](https://github.com/agentxm/axm).

## License

FSL-1.1-MIT © 2025-2026 AgentXM, Inc. See the
[license](https://github.com/agentxm/axm/blob/main/LICENSE).
