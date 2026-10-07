---
type: Domain Concept
description:
  "The shared AgentXM product model: accounts, agents, extensions, versions,
  types, ownership, the registry, the marketplace and its listings, AXM,
  workspaces, native locations, readers, consumers, packs, and libraries."
tags: [agentxm, axm, extension, registry, marketplace, workspace, domain-model]
status: stable
generated:
  by: codex/gpt-6
  at: 2026-10-01T03:12:00Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README
  - id: axm-agent-catalog
    resource: https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md
    title: AXM Agent Capability Catalog
---

# The AgentXM product model

AgentXM helps people discover, create, share, and use extensions for coding
agents. The registry is the shared distribution service; AXM is the command-line
tool that works with extensions locally.[^axm-readme]

This concept is the source of truth for the shared terms below. Component
designs may explain how they implement these concepts, but should not give the
terms a different product meaning.

## Core terms

| Term                    | Meaning                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                 | An AgentXM identity and governance container for a person, organization, or enterprise. Accounts own registry resources and policies.                                                                                                                                     |
| Agent                   | A coding assistant or agentic development tool that can use one or more kinds of extension.                                                                                                                                                                               |
| Extension               | A named unit of reusable capability or content for agents. Every extension has exactly one extension type.                                                                                                                                                                |
| Extension type          | The category that defines an extension's purpose and governing content contract, such as a skill, MCP server, or pack.                                                                                                                                                    |
| Extension version       | An immutable published release of an extension. The extension keeps its identity across versions.                                                                                                                                                                         |
| Extension archive       | The immutable ZIP distributed by the registry for one extension version. It contains that version's manifest and published content; archive integrity applies to its exact bytes.                                                                                         |
| Software package        | An artifact from a software package ecosystem, identified across ecosystems by a Package URL (purl). It is not an AgentXM extension.                                                                                                                                      |
| Companion package       | A software package that an extension declares it supports or accompanies. The relationship helps people find relevant extensions; AXM does not install the software package.                                                                                              |
| Registry                | The AgentXM service through which extensions are published, discovered, and distributed.                                                                                                                                                                                  |
| Marketplace             | The public AgentXM web surface where people discover, evaluate, and install extensions.                                                                                                                                                                                   |
| Listing                 | An extension's page in the marketplace. The extension's visibility decides who can see its listing.                                                                                                                                                                       |
| AXM                     | The Agent Extension Manager CLI. AXM creates, validates, publishes, discovers, installs, and manages extensions.                                                                                                                                                          |
| Workspace               | A local scope in which AXM manages extensions for a project or a user. The workspace's internal state model belongs to AXM's design.                                                                                                                                      |
| Native location         | A file or directory in a project or user scope that agents read for extension content or configuration.                                                                                                                                                                   |
| Reader                  | A catalog declaration that an agent can read a native location, including its applicable scope, conditions, and supported representation.                                                                                                                                 |
| Consumer                | A configured reader whose scope and reading conditions apply in the evaluated workspace.                                                                                                                                                                                  |
| Source                  | [Defined in Extension sources and resolution](sources.md#source).                                                                                                                                                                                                         |
| Source family           | [Defined in Extension sources and resolution](sources.md#source-family).                                                                                                                                                                                                  |
| Locator                 | [Defined in Extension sources and resolution](sources.md#locator).                                                                                                                                                                                                        |
| Accepted resolution     | [Defined in Extension sources and resolution](sources.md#accepted-resolution).                                                                                                                                                                                            |
| Local installation name | [Defined in Extension sources and resolution](sources.md#local-installation-name).                                                                                                                                                                                        |
| Handle                  | The public `@<slug>` identity under which extensions and other registry resources are named.                                                                                                                                                                              |
| Owner                   | The account whose handle scopes an extension or other registry resource. Ownership is durable product authority, not necessarily the identity of the person performing an action.                                                                                         |
| Publisher               | The person, or the trusted publisher acting for a person, that publishes an extension version on behalf of its owner. A publisher acts with authority; publishing does not transfer ownership.                                                                            |
| Trusted publisher       | A non-human principal a user creates so a CI workflow can publish without a stored secret. It trusts exactly one workflow, identified by the CI provider's immutable ids, and may publish new versions of its owner's existing extensions, never more than its owner may. |
| Workload token          | A short-lived registry token a CI job receives by exchanging its CI provider's signed identity token under a trusted publisher. It lives at most an hour, has no refresh token, and carries only the trusted publisher's permissions.                                     |
| Pack                    | An extension whose content is a collection of references to other extensions. Packs compose extensions without copying or erasing their identities.                                                                                                                       |
| Library                 | A registry collection of extension identities for discovery and organization. A library is not an extension, is not versioned, and is not installed as a unit.                                                                                                            |

## Identity and versions

An extension's identity is `(handle, type, name)`. Its fully qualified name
(FQN) is the user-facing spelling of that identity. Adding a version identifies
one immutable published release. See [Identifier grammar](identifier-grammar.md)
for the exact forms.

An extension and an extension version are not interchangeable. Metadata that
describes the extension across releases belongs to the extension; released
content belongs to a version. Publishing a new version does not create a new
extension identity.

Extension-identity deprecation is structured, warning-only guidance that can
name another extension identity as a replacement. It does not change version
resolution or artifact availability. Version withdrawal is the separate yank
lifecycle. See [Visibility and discovery](visibility-and-discovery.md) for the
lifecycle and disclosure boundaries.

## Agent identity and compatibility

An agent catalog identity names a product and its supported execution surface.
Keep the product, surface, edition, owning company, and model providers
distinct. A model choice does not create a new coding-agent identity. An
evidenced product rename can retain its identity; a different runtime or
extension contract needs its own assessment. Lifecycle qualifications belong to
the affected vendor, product, surface, or edition rather than automatically
retiring every related surface.

Agent compatibility has three independent parts: what the vendor natively
offers, what AXM can deliver, and which conditions govern installation. Native
presence can be known even when AXM cannot model or write its configuration.
Manual and conditional delivery must remain qualified. Unknown availability
means the evidence is missing or inconclusive; absence requires evidence.

Source review establishes only the claims checked against those sources.
Configuration verification and vendor-runtime verification establish different
execution boundaries. Neither a recent source review nor an undifferentiated
historical date proves that an agent consumed an extension. The
[Agent Capability Catalog](https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md)
owns the current per-agent inventory and its released reference; product
documents explain these meanings without maintaining a second
inventory.[^axm-agent-catalog]

## Product boundaries

- AgentXM names the platform; AXM names its CLI component. See
  [AXM and AgentXM naming](naming.md).
- The registry distributes extensions; AXM manages their local use.
- The marketplace presents extensions to people; the registry publishes and
  distributes them. A private extension still has a listing, visible only to
  principals its owner authorizes. See
  [Visibility and discovery](visibility-and-discovery.md).
- Extension identity says what an extension claims to be; its source and
  accepted resolution say where its content came from and which content the
  workspace accepted. See [Extension sources and resolution](sources.md).
- A workspace is a local AXM boundary, not a registry ownership container.
- A native location can serve several agents, and an agent can read several
  native locations. The location is distinct from the extension's source.
- Catalog readers describe known reading capabilities. Configured, applicable
  readers are consumers; other catalog readers are potential readers. Unknown
  reading conditions remain unverified. A declaration alone does not establish
  that an agent discovered or used the content.
- A pack is an extension type and an install target. A library is a registry
  collection and is not an install target.
- An extension, an extension version, an extension archive, and a software
  package are distinct. Documents should not use "package" as a synonym for an
  extension or its content.

See [Package URL and VERS](../ecosystem/package-url-and-vers.md) for the
external standards behind software-package and companion-package identity.

[^axm-readme]: AXM repository README.

[^axm-agent-catalog]: AXM Agent Capability Catalog.
