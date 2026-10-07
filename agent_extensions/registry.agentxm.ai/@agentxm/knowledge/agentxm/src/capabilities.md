---
type: Reference
title: AgentXM capabilities
description:
  System-wide capabilities for AXM workspace management and AgentXM discovery,
  sharing, and governance.
tags:
  [capabilities, workspace, registry, marketplace, axm, enterprise, security]
status: stable
generated:
  by: openai/codex
  at: 2026-09-29T06:23:20Z
---

# AgentXM capabilities

This is the shared capability catalog for the entire AgentXM system. Use its
names and definitions in product planning, architecture, documentation, and
comparisons with alternatives.

The catalog contains 12 AXM capabilities for workspace management and 18 AgentXM
capabilities grouped under Discover, Share, and Govern. In this organization,
the AgentXM section covers the registry, marketplace, and their platform
administration; AgentXM remains the name of the whole system. Shared terms
follow [the AgentXM product model](domain/extension-model.md).

Each capability describes one recognizable ability. Supporting features clarify
its scope without becoming separate top-level capabilities. The groups do not
allocate implementation to a particular application, service, or repository.
Definitions do not establish current availability or a commitment to deliver
particular features. Specifications and requirements own accepted obligations;
product assessments record current coverage and supporting evidence separately.

## AXM

### Manage agent skills

Maintain agent skills in a workspace for use by agents. Supporting features
include creation, installation, configuration, updates, and removal.

### Manage MCP server connections

Configure connections between agents and MCP servers in a workspace.

### Manage agent instruction files

Maintain managed guidance in the instruction files agents read for a workspace.
See [Rules](domain/extension-types.md).

### Manage subagents

Maintain definitions of specialized agents that can receive delegated tasks.

### Manage agent hooks

Configure actions that run at selected points in an agent's lifecycle.

### Manage knowledge bundles

Maintain collections of knowledge that agents can discover and read on demand.

### Manage packs

Maintain groups of extension references that can be configured as a unit. See
[Extension pack semantics](domain/pack-semantics.md).

### Configure extensions across agents

Apply a workspace's extension configuration to its selected agents. Supporting
features include applying compatible configuration at shared
[native locations](domain/extension-model.md), preserving configuration needed
by remaining consumers, and explaining affected locations, their consumers, and
retention reasons. Reports distinguish configured consumers from potential
readers and make unverified reading conditions explicit.

### Import existing extensions

Bring existing extension content into AXM management from another source or
agent configuration.

### Validate extensions

Check workspace extension content against its governing format and content
rules.

### Reproduce workspace setups

Recreate a declared extension setup in another workspace or environment.
Supporting features include recorded versions, restoration, and reconciliation.

### Enforce workspace policies

Apply rules governing which extensions may be used in a workspace. This is the
local enforcement of policy; organizational policy management belongs under
[Enforce extension policies](#enforce-extension-policies).

## AgentXM

### Discover

#### Find extensions

Locate extensions relevant to a user's needs. Supporting features include
search, browsing, filters, and recommendations.

#### Evaluate extensions

Help a user decide whether an extension meets their needs. Supporting features
include documentation, examples, compatibility information, provenance, reviews,
and evaluation results. This capability presents decision evidence; security
assessment and provenance verification produce their respective evidence.

#### Curate libraries

Organize extension identities for discovery by an audience. Supporting features
include collections, recommendations, organizational catalogs, curation archival
and restoration, and deleted-name reuse holds. See
[Libraries](domain/extension-model.md).

### Share

#### Publish extensions

Make extensions available through the registry under their owners' identities.
Supporting features include publisher profiles, publishing workflows, and
automated publishing, including trusted publishing from CI without a stored
secret.

#### Manage extension releases

Maintain the published lifecycle of an extension. Supporting features include
versions, release history, publisher archive and restoration, deprecation,
version yank and restoration, and withdrawal. See
[Visibility and discovery](domain/visibility-and-discovery.md).

#### Distribute private extensions

Deliver extensions to an authorized audience within a private access boundary.
Supporting features include internal sharing and restricted distribution to
customers or partners.

#### Understand adoption

Understand how published extensions are being used. Supporting features include
downloads, installations, and usage trends. Adoption analysis addresses product
usefulness and reach; [Audit activity](#audit-activity) establishes
accountability for actions.

### Govern

#### Manage organizations

Administer organizational participation in AgentXM. Supporting features include
membership, teams, enterprise structure, and delegated administration. Account
meaning follows [the product model](domain/extension-model.md).

#### Manage single sign-on

Control how people authenticate through an organization's identity provider.
Supporting features include identity-provider connections and SSO enforcement.

#### Synchronize directories

Keep organizational identities and memberships aligned with an external
directory. Supporting features include SCIM provisioning, group synchronization,
and deprovisioning. Directory synchronization manages the identity lifecycle;
[Manage single sign-on](#manage-single-sign-on) manages authentication.

#### Control resource access

Determine which actors may perform which operations on AgentXM resources.
Supporting features include roles, permissions, service identities, least
privilege, token restrictions, and an organization's governance of member tokens
that can reach it: an inventory, withdrawing the organization from a token, and
a lifetime limit.

#### Enforce extension policies

Control which extensions may be published, distributed, or consumed under an
organization's or the platform's rules. Supporting features include publishing
gates, approved sources, required checks, and consumption restrictions.
Permission to perform an operation does not imply that policy permits every
extension involved in it. Security findings inform policy decisions; policy
enforcement is distinct from producing those findings.

#### Moderate content

Handle content or participation that violates platform rules. Supporting
features include reports, investigations, reversible extension holds, content
removal, and publisher restrictions. Moderation addresses abuse such as spam or
misleading listings; [Respond to security threats](#respond-to-security-threats)
addresses compromise and security risk, including incidents involving otherwise
legitimate content.

#### Audit activity

Establish an attributable record of user and system actions. Supporting features
include audit events, search, export, and integration with security tools.

#### Manage spending

Administer spending on AgentXM offerings. Supporting features include billing,
subscriptions, seats, and budgets. This capability does not establish an
extension resale or publisher-payout model.

#### Assess extension security

Identify security risks in extension content. Supporting features include checks
for malicious behavior, exposed secrets, vulnerable dependencies, and other
risks. Assessments state their coverage and limitations; a lack of findings is
not a guarantee that an extension is safe.

#### Verify extension provenance

Establish the authenticated origin and integrity of published extension content.
Supporting features include publisher verification, signatures, and
attestations. Provenance establishes where content came from and whether it
matches the claimed release; it does not establish that the content is safe.

#### Respond to security threats

Coordinate containment and remediation when an extension or identity presents a
security threat. Supporting features include whole-extension holds, release
withdrawal, credential revocation, notifications to affected consumers, and
remediation tracking.

## Security across the system

Security also qualifies every capability. Platform protections such as
encryption, tenant isolation, secure sessions, backups, and vulnerability
management belong in the system's security requirements and assurance work. The
capability catalog identifies responsibilities; it does not specify those
protections or establish security guarantees.

## Maintaining the catalog

Keep capability names short and independently comparable. Put supporting detail,
such as creation, installation, updates, supported agents, and limitations,
under the relevant capability in the consuming document. Split a capability when
it combines distinct abilities that need separate assessment. Keep the catalog
compact without using a fixed count to hide a meaningful responsibility.

Use the existing product concepts to define terms and link to them rather than
redefining them here. Reuse the capability headings as reference anchors. When
an assessment reveals an ability missing from this catalog, propose the catalog
addition explicitly; an alternative's feature does not by itself establish a new
AgentXM capability or product commitment.
