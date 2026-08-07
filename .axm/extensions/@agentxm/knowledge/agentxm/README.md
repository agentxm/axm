# AgentXM Platform Knowledge

Curated, public knowledge about the [AgentXM](https://agentxm.ai) platform and
the AXM extension model, packaged as an Open Knowledge Format (OKF) 0.2
bundle. Install it to give people and agents on-demand, searchable reference
material about how AgentXM extensions, identifiers, packs, visibility, and
publishing work — without spending context on material a task does not need.

## What's inside

- **Domain concepts** — the extension model and extension types, the
  identifier grammar, pack semantics, visibility and discovery, and the
  AXM/AgentXM naming convention.
- **Architecture** — the public platform surfaces and what each serves.
- **Workflows** — the extension authoring → publish → install lifecycle.
- **References** — canonical public resources for going deeper.

## Install

```bash
axm install @agentxm/knowledge/agentxm
```

Then discover concepts on demand:

```bash
axm knowledge search "identifier"
axm knowledge open agentxm domain/identifier-grammar
```

## Relationship to other documentation

This bundle is curated knowledge *about* the platform. Executable contracts
(JSON Schemas, OpenAPI specs), CLI help topics (`axm help <topic>`), and the
product documentation at [axm.sh](https://axm.sh) and
[agentxm.ai](https://agentxm.ai) remain the systems of record for their own
concerns; concepts cite them rather than replacing them.

## License

CC-BY-4.0. Attribute as: "AgentXM Platform Knowledge, © AgentXM,
CC-BY-4.0" with a link to https://agentxm.ai.
