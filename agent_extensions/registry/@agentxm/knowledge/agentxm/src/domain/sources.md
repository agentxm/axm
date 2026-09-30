---
type: Domain Concept
description:
  The vocabulary that separates where extension content comes from, how AXM
  locates it, what exact content a workspace accepted, and how it is named
  locally.
tags: [source, locator, resolution, provenance, workspace, install]
status: stable
generated:
  by: openai/codex
  at: 2026-09-19T15:59:01Z
---

# Extension sources and resolution

An extension's declared identity and the authority that supplied its content are
separate facts. A manifest can claim an owner and name, but that claim does not
prove control of the matching registry identity. AXM therefore preserves source
provenance independently of extension identity through installation, update, and
switching.

## Source

A **source** is the authority and content boundary from which AXM obtains an
extension package. Source choice determines acquisition and provenance; it does
not change the extension type's semantics.

One workspace accepts at most one source and resolution for an extension's fully
qualified name. Matching names do not establish that content from two sources is
equivalent.

## Source family

A **source family** is one of the four acquisition and authority classes AXM
supports for extensions:

| Family      | Content boundary                                            | Resolution behavior                                                     |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `git`       | A repository, optionally narrowed to a package subdirectory | A revision selector resolves to a commit and tree                       |
| `registry`  | An extension registry                                       | A version constraint resolves to an immutable published version         |
| `path`      | A filesystem path                                           | The path's package tree is observed directly                            |
| `workspace` | The selected AXM scope's authored extension tree            | Authored content is intrinsic to the workspace and has no external lock |

Every extension type is installable from every source family. Hosted Git
providers are input conveniences within the `git` family, not additional
families.

## Locator

A **locator** is the self-describing address of an external source boundary. It
says where AXM should acquire content, but not which immutable content was
accepted there. A locator is one of:

- `git`: a clone URL with an optional revision selector and package path;
- `registry`: a registry URL; or
- `path`: a filesystem path.

Locators contain no configured source name, hosted-provider name, or credential.
Hosted shorthand and browser URLs are input forms that AXM expands to a `git`
locator. Registry configuration may select which registry URL to put in a
locator, but the stored locator remains self-describing. `workspace` is an
intrinsic source family rather than an external locator.

## Accepted resolution

An **accepted resolution** is the exact external content a workspace agreed to
use from a locator. AXM records it in `axm-lock.yaml` so reconciliation can
reacquire that content without silently resolving a new target:

- Git records the commit and package tree selected from the repository;
- registry records the version, archive integrity, and publisher binding; and
- path records the observed package tree.

Every external lock entry also records family-independent tree integrity for the
materialized package. Workspace-authored content has no external accepted
resolution and therefore no lock entry.

An input such as a Git branch or a registry version range is selection intent,
not an accepted resolution. An update may evaluate that intent again and, when
allowed, accept a new immutable result.

## Local installation name

A **local installation name** is the key under which the selected AXM workspace
records and manages an installed extension in `axm.json`. It is a local
lifecycle handle, not the extension's declared identity, a source name, or proof
of ownership.

AXM keeps the local installation name through updates and source switches. Two
extensions that would use the same key must be disambiguated at installation; an
installed entry is not renamed in place. Pack members retain their declared
names.

## Source switching

Installing an already installed fully qualified name from a different source
authority requests a **source switch**. AXM previews the provenance, content,
dependency, and projection changes before applying one atomic replacement. A
switch preserves the local installation name, enabled state, configuration,
inputs, and ownership while changing the source and accepted resolution.

A pack switch resolves the target manifest as a unit and previews its member
diff. It does not let a consumer choose independent sources for inherited pack
members.
