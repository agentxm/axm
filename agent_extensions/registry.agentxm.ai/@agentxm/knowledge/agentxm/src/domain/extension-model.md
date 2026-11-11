---
type: Domain Concept
description:
  "The shared AgentXM product model: accounts, agents, extensions, versions,
  types, ownership, the registry, the marketplace and its listings, AXM,
  workspaces, native locations, readers, consumers, packs, and libraries."
tags: [agentxm, axm, extension, registry, marketplace, workspace, domain-model]
status: stable
generated:
  by: claude/opus-5.5
  at: 2026-10-31T00:19:51Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README
  - id: axm-agent-catalog
    resource: https://github.com/agentxm/axm/blob/main/packages/core/extension-model/src/unstable/agent-capabilities/data/agents/README.md
    title: AXM Agent Capability Catalog
---

# The AgentXM product model

AgentXM helps people discover, create, share, and use extensions for their AI
agents, like skills, MCP servers, and subagents. The registry is the shared
distribution service; AXM is the command-line tool that works with extensions
locally.[^axm-readme]

The
[Agent Extension Glossary](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md)
owns the public-facing definitions. This concept defines specialized product
terms and explains their relationships; component designs specialize
implementation without assigning different meanings.

## Core terms

| Term                    | Meaning                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                 | An AgentXM identity and governance container for a person, organization, or enterprise. Accounts own registry resources and policies.                                                                                                                                                                                                                          |
| Agent                   | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#agent).                                                                                                                                                                                                                                            |
| Agent extension         | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#agent-extension).                                                                                                                                                                                                                                  |
| Extension type          | The category that defines an extension's purpose and governing content contract, such as a skill, MCP server, or pack.                                                                                                                                                                                                                                         |
| Extension version       | An immutable published release of an extension. The extension keeps its identity across versions.                                                                                                                                                                                                                                                              |
| Extension archive       | The immutable ZIP distributed by the registry for one extension version. It contains that version's manifest and published content; archive integrity applies to its exact bytes.                                                                                                                                                                              |
| Software package        | An artifact from a software package ecosystem, identified across ecosystems by a Package URL (purl). It is not an AgentXM extension.                                                                                                                                                                                                                           |
| Companion package       | A software package that an extension declares it supports or accompanies. The relationship helps people find relevant extensions; AXM does not install the software package.                                                                                                                                                                                   |
| Registry                | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#agent-extension-registry).                                                                                                                                                                                                                         |
| Marketplace             | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#agent-extension-marketplace).                                                                                                                                                                                                                      |
| Listing                 | An extension's page in the marketplace. The extension's visibility decides who can see its listing.                                                                                                                                                                                                                                                            |
| AXM                     | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#agent-extension-manager).                                                                                                                                                                                                                          |
| Workspace               | [Defined in Workspaces](#workspaces).                                                                                                                                                                                                                                                                                                                          |
| Native location         | A file or directory in a project or user scope that agents read for extension content or configuration.                                                                                                                                                                                                                                                        |
| Reader                  | A catalog declaration that an agent can read a native location, including its applicable scope, conditions, and supported representation.                                                                                                                                                                                                                      |
| Consumer                | A configured reader whose scope and reading conditions apply in the evaluated workspace.                                                                                                                                                                                                                                                                       |
| Source                  | [Defined in Extension sources and resolution](sources.md#source).                                                                                                                                                                                                                                                                                              |
| Source family           | [Defined in Extension sources and resolution](sources.md#source-family).                                                                                                                                                                                                                                                                                       |
| Locator                 | [Defined in Extension sources and resolution](sources.md#locator).                                                                                                                                                                                                                                                                                             |
| Accepted resolution     | [Defined in Extension sources and resolution](sources.md#accepted-resolution).                                                                                                                                                                                                                                                                                 |
| Local installation name | [Defined in Extension sources and resolution](sources.md#local-installation-name).                                                                                                                                                                                                                                                                             |
| Handle                  | The public `@<slug>` identity under which extensions and other registry resources are named.                                                                                                                                                                                                                                                                   |
| Owner                   | The account whose handle scopes an extension or other registry resource, and the name the marketplace gives it. Versions are published under the owner's handle: whoever performs a publish acts on the owner's behalf and does not become the owner. Ownership is durable product authority, not necessarily the identity of the person performing an action. |
| Pack                    | [Definition](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md#extension-pack).                                                                                                                                                                                                                                   |
| Library                 | A registry collection of extension identities for discovery and organization. A library is not an extension, is not versioned, and is not installed as a unit.                                                                                                                                                                                                 |

## Workspaces

"Workspace" has two senses. The surface a reader is on decides which one they
meet.

- **In the AgentXM product**, a workspace is where an account works: the
  personal workspace, an organization, or an enterprise. One signed-in account
  can open several workspaces. Switching workspace changes where that account
  works, never which account is signed in. Each workspace is an account's own
  pages, so ownership of registry resources stays with the account (see Owner).
- **In AXM**, a workspace is a local scope in which AXM manages extensions for a
  project or a user. Its internal state model belongs to AXM's design.

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
  accepted resolution say where its content came from and which content the AXM
  workspace accepted. See [Extension sources and resolution](sources.md).
- An AXM workspace is a local boundary, not a registry ownership container; a
  product workspace is an account's own pages, and the account owns what is
  published there.
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
