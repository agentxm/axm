# Directory Update Log

## 2026-10-31

- **Update**: Kept specialized product terms in the product model as the shared
  public glossary narrowed to 18 entries; refreshed links to its agreed public
  labels.

- **Ownership**: Transferred shared term definitions to the
  [Agent Extension Glossary](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md);
  retained platform relationships, type identifiers, and naming conventions
  here. The new glossary is a draft candidate for terminology review.

## 2026-10-30

- **Update**: Added [Workspaces](domain/extension-model.md#workspaces) to
  [The AgentXM product model](domain/extension-model.md). In the product, a
  workspace is the personal workspace, an organization or an enterprise the
  account works in; in AXM it stays a local scope for managing extensions.
  Switching workspace never changes the signed-in account.

## 2026-10-29

- **Update**: Added
  [the registry and marketplace names](domain/naming.md#the-registry-and-marketplace-names)
  to [AXM and AgentXM naming](domain/naming.md). The registry is the Agent
  Extension Registry and the marketplace the Agent Extension Marketplace, never
  the AgentXM Registry or AgentXM Marketplace.
- **Update**: Withdrew trusted publishing while it is not available to every
  account. Removed trusted publisher and workload token from
  [The AgentXM product model](domain/extension-model.md#core-terms), and trusted
  publishing from [Handles and ownership](domain/handles-and-ownership.md),
  [The extension lifecycle](workflows/extension-lifecycle.md),
  [Capabilities](capabilities.md), and
  [Public platform surfaces](architecture/platform-surfaces.md). Publishing from
  CI uses a `publish` personal access token.

## 2026-10-27

- **Update**: Added [the AXM mark](domain/naming.md#the-axm-mark) to
  [AXM and AgentXM naming](domain/naming.md). AgentXM's favicon is the AXM mark,
  used only in slots of 24 px and less beside a title that names AgentXM; in
  text, AXM still names only the CLI.

## 2026-10-22

- **Update**: Retired publisher as the name of an account in
  [The AgentXM product model](domain/extension-model.md#core-terms). The account
  an extension is published under is its owner, in the marketplace as everywhere
  else, so the bundle has one word for it. Publish stays the verb, and trusted
  publisher stays the CI principal that publishes for an owner. Updated
  [Handles and ownership](domain/handles-and-ownership.md),
  [Visibility and discovery](domain/visibility-and-discovery.md),
  [The extension lifecycle](workflows/extension-lifecycle.md), and
  [Capabilities](capabilities.md) to match.

## 2026-10-07

- **Update**: Redefined publisher in
  [The AgentXM product model](domain/extension-model.md#core-terms) as the
  account an extension is published under, which is how the rest of this bundle
  already uses the word. The actor that performs a publish is no longer called a
  publisher. Trusted publisher is unchanged: it remains the non-human principal
  that publishes from CI, and is the only actor term that carries the word.

## 2026-10-05

- **Update**: Libraries use immutable IDs, editable non-unique titles,
  authorized readable links, and immediate title reuse after deletion. Updated
  identifier grammar, ownership, and visibility guidance.

## 2026-10-01

- **Update**: Defined marketplace and listing in
  [The AgentXM product model](domain/extension-model.md), separating the
  marketplace that presents extensions from the registry that distributes them.
- **Update**: Defined product, execution surface, edition, ownership, and model
  provider distinctions in
  [The AgentXM product model](domain/extension-model.md#agent-identity-and-compatibility).
  Native availability, AXM delivery, installation conditions, source review, and
  execution verification now retain independent meanings. Linked the public
  Agent Capability Catalog as the current per-agent inventory authority.

## 2026-09-29

- **Update**: Defined native location, reader, and consumer in
  [The AgentXM product model](domain/extension-model.md), distinguishing
  configured consumers, potential readers, and unverified reading conditions.
- **Update**: Extended
  [Configure extensions across agents](capabilities.md#configure-extensions-across-agents)
  with shared native locations, preservation for remaining consumers, and
  explanations of location and retention outcomes.

## 2026-09-28

- **Update**: Added trusted publisher and workload token to
  [The AgentXM product model](domain/extension-model.md) and widened publisher
  to include a trusted publisher acting for a person.
- **Update**: Stated in [Handles and ownership](domain/handles-and-ownership.md)
  that the handle is the identity a version is published under, whoever
  publishes it.
- **Update**: Added publishing from CI through a trusted publisher to
  [The extension lifecycle](workflows/extension-lifecycle.md), with the
  personal-access-token fallback and its seven-day default.
- **Update**: Named trusted publishing and organization governance of member
  tokens in [AgentXM capabilities](capabilities.md), and the CI token exchange
  and secret-scanning alert endpoint in
  [Public platform surfaces](architecture/platform-surfaces.md).

## 2026-09-25

- **Update**: Defined structured extension deprecation reasons and the bounded
  consumer migration command in
  [Visibility and discovery](domain/visibility-and-discovery.md).

## 2026-09-24

- **Update**: Stated when a whole extension can be deleted in
  [Visibility and discovery](domain/visibility-and-discovery.md) — only while
  nothing is published, or within 24 hours of the first published version while
  nothing depends on it — and linked it from
  [Handles and ownership](domain/handles-and-ownership.md).

## 2026-09-19

- **Creation**: Added [Extension sources and resolution](domain/sources.md) as
  the canonical vocabulary for source, locator, source family, accepted
  resolution, and local installation name.
- **Update**: Revised
  [The extension lifecycle](workflows/extension-lifecycle.md) for registry, Git,
  and path installation and updates, exact reconciliation, and source switching.
- **Update**: Added publisher archive and platform hold to the lifecycle
  comparison, workflow, ownership distinctions, and capability catalog.
- **Update**: Defined Library archival as a curation freeze independent of
  visibility and access, and documented the 24-hour deleted-name reuse hold.

## 2026-09-07

- **Update**: Revised [AgentXM capabilities](capabilities.md) to 12 AXM
  capabilities and 18 AgentXM capabilities under Discover, Share, and Govern,
  including enterprise administration and explicit security responsibilities.
- **Creation**: Added the draft [AgentXM capabilities](capabilities.md) catalog
  covering the entire system, including AXM, the registry, and the marketplace.
