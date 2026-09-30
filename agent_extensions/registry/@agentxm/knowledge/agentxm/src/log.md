# Directory Update Log

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
