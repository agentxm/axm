/**
 * Shared scanner types: occurrence shape, common per-occurrence fields, and
 * scanner-tier origin discriminators.
 *
 * Per Decision 5 of the workspace read-model design, scanner output is
 * occurrence-shaped (`ReadonlyArray<Occurrence>`) — one entry per observable
 * physical materialization. There is no central `DetectionOrigin` union; each
 * scanner exports the discriminator it observes, and per-subject modules in
 * Phase 7 map these scanner-tier discriminators into subject-specific origin
 * unions.
 *
 * Identity of an actual entry is `(scope, type | agentId, origin, contentLocation)`.
 * Two scanner paths observing the same physical occurrence collapse to one
 * entry; two distinct physical paths under the same name produce two entries
 * with different identities.
 */

import * as Option from "effect/Option";
import type { ExtensionName, ExtensionType } from "../../../extensions/common.js";
import type { Handle } from "../../../extensions/handle.js";
import type { AgentId } from "../../../agents/types.js";
import type { AbsolutePath } from "../../../utils/path-types.js";
import type { Scope } from "../types.js";

// ---------------------------------------------------------------------------
// Canonical extensions scanner
// ---------------------------------------------------------------------------

/**
 * Origin tag for an occurrence emitted by the canonical-extensions scanner.
 * `canonical-axm` covers authored or owner-qualified packages;
 * `external-axm` covers user-scope external-layout packages.
 */
export type CanonicalExtensionOriginKind = "canonical-axm" | "external-axm";

/**
 * One canonical package materialization observed in an authored root,
 * `agent_extensions/`, or the user-scope `agent_extensions/` root.
 *
 * Fields:
 *
 * - `scope` — the scoping tier this occurrence belongs to (project | user).
 * - `type` — the subject extension type.
 * - `origin` — scanner-tier origin (canonical-axm | external-axm).
 * - `name` — the subject's directory name (last segment under owner/type).
 * - `owner` — the registry-owner prefix for canonical AXM, `null` for external.
 * - `contentLocation` — absolute path on the synthesized FS to the subject's
 *   content root (the directory itself, not a file inside it).
 * - `pathSegments` — `contentLocation` split via the `Path` service. Subject
 *   modules reach for this when they need to derive parent paths
 *   (`packageRoot`, etc.) without re-parsing the string. Cross-platform safe.
 * - `subjectFile` — `Some(path)` when the subject type has a canonical
 *   primary content file (e.g., `<dir>/SKILL.md` for skills). `None` for
 *   subject types that do not use a fixed primary file (mcp-server, file,
 *   rule, pack).
 * - `subjectFileExists` — `true` if the scanner probed `subjectFile` and found
 *   it present. Always `false` when `subjectFile` is `None`. Subject modules
 *   consume this rather than hardcoding presence.
 */
export interface CanonicalExtensionOccurrence {
  readonly _tag: "canonical-extension";
  readonly scope: Scope;
  readonly type: ExtensionType;
  readonly origin: CanonicalExtensionOriginKind;
  readonly name: ExtensionName;
  readonly owner: Handle | null;
  readonly contentLocation: AbsolutePath;
  readonly pathSegments: ReadonlyArray<string>;
  readonly subjectFile: Option.Option<AbsolutePath>;
  readonly subjectFileExists: boolean;
}

// ---------------------------------------------------------------------------
// Agent-dir scanner
// ---------------------------------------------------------------------------

/**
 * Subject types renderable into per-agent directories. Only the subjects
 * actually observed by the v1 scanner are listed; rules render through
 * subject-specific dirs that the agent registry does not currently encode and
 * are therefore out of scope for the agent-dir scanner.
 */
export type AgentDirSubjectType = "skill" | "subagent";

/**
 * One materialization observed under a per-agent rendered directory
 * (`.claude/skills/`, `.codex/agents/`, `.roomodes`,
 * etc.). The origin discriminator carries the agent id so per-subject modules
 * can map cleanly into agent-specific origins.
 *
 * Structural fields mirror `CanonicalExtensionOccurrence`:
 *
 * - `pathSegments` — `contentLocation` split via the `Path` service.
 * - `subjectFile` — `Some(path)` when the subject type has a canonical
 *   primary file (skill → `<dir>/SKILL.md`, command → `<dir>/${name}.md`,
 *   subagent dir → `<dir>/${name}.md`). For single-file subagent surfaces
 *   (e.g., `.roomodes`) the `subjectFile` is the `contentLocation` itself.
 * - `subjectFileExists` — `true` if the scanner probed `subjectFile` and
 *   found it present. Always `false` when `subjectFile` is `None`. For
 *   single-file subagents this is always `true` because presence of the file
 *   is what produced the occurrence.
 */
export interface AgentDirOccurrence {
  readonly _tag: "agent-dir";
  readonly scope: Scope;
  readonly type: AgentDirSubjectType;
  readonly agentId: AgentId;
  /** Primary write path or the catalog status of an additional read-only path. */
  readonly readPathStatus?: "primary" | "canonical" | "compat" | "deprecated";
  readonly name: string;
  readonly contentLocation: AbsolutePath;
  readonly pathSegments: ReadonlyArray<string>;
  readonly subjectFile: Option.Option<AbsolutePath>;
  readonly subjectFileExists: boolean;
}

// ---------------------------------------------------------------------------
// MCP config scanner
// ---------------------------------------------------------------------------

/** Physical MCP configuration surface that supplied an observation. */
export type McpConfigSurface =
  { readonly _tag: "shared" } | { readonly _tag: "agent"; readonly agentId: AgentId };

/** One MCP server entry observed on one physical configuration surface. */
export interface McpConfigOccurrence {
  readonly _tag: "mcp-config";
  readonly scope: Scope;
  readonly surface: McpConfigSurface;
  readonly name: ExtensionName;
  readonly contentLocation: AbsolutePath;
  readonly config: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Agent-settings scanner
// ---------------------------------------------------------------------------

/**
 * One agent-native settings file observed on disk (e.g.,
 * `.claude/settings.json`).
 *
 * `contentLocation` is the absolute path to the settings file. There is no
 * "name" in the subject sense — the file itself is the materialization, keyed
 * by `agentId`.
 */
export interface AgentSettingsOccurrence {
  readonly _tag: "agent-settings";
  readonly scope: Scope;
  readonly agentId: AgentId;
  readonly contentLocation: AbsolutePath;
}

// ---------------------------------------------------------------------------
// Identity helper
// ---------------------------------------------------------------------------

/**
 * Stable occurrence identity tuple. The four-part shape mirrors the spec's
 * "Actual entries carry stable occurrence identity" requirement:
 * `(scope, type | agentId, origin, contentLocation)`. `subjectKey` is the
 * subject discriminator — extension type for extension occurrences, agent id
 * for agent occurrences.
 */
export interface OccurrenceIdentity {
  readonly scope: Scope;
  readonly subjectKey: string;
  readonly origin: string;
  readonly contentLocation: string;
}

/**
 * All occurrence shapes scanners emit. The discriminator on `_tag` lets
 * downstream subject modules narrow without a centralized origin union.
 */
export type ScannerOccurrence =
  CanonicalExtensionOccurrence | AgentDirOccurrence | McpConfigOccurrence | AgentSettingsOccurrence;

/**
 * Compute the identity tuple for one occurrence. Two scanner paths observing
 * the same physical occurrence produce equal identities; distinct physical
 * paths under the same name produce different identities.
 */
export const occurrenceIdentity = (occurrence: ScannerOccurrence): OccurrenceIdentity => {
  switch (occurrence._tag) {
    case "canonical-extension":
      return {
        scope: occurrence.scope,
        subjectKey: occurrence.type,
        origin: occurrence.origin,
        contentLocation: occurrence.contentLocation,
      };
    case "agent-dir":
      return {
        scope: occurrence.scope,
        subjectKey: `${occurrence.type}:${occurrence.agentId}`,
        origin: `agent-dir:${occurrence.agentId}`,
        contentLocation: occurrence.contentLocation,
      };
    case "mcp-config":
      return occurrence.surface._tag === "shared"
        ? {
            scope: occurrence.scope,
            subjectKey: "mcp-server",
            origin: "shared-mcp-config",
            contentLocation: `${occurrence.contentLocation}#${occurrence.name}`,
          }
        : {
            scope: occurrence.scope,
            subjectKey: `mcp-server:${occurrence.surface.agentId}`,
            origin: `agent-mcp-config:${occurrence.surface.agentId}`,
            contentLocation: `${occurrence.contentLocation}#${occurrence.name}`,
          };
    case "agent-settings":
      return {
        scope: occurrence.scope,
        subjectKey: `agent-settings:${occurrence.agentId}`,
        origin: `agent-settings:${occurrence.agentId}`,
        contentLocation: occurrence.contentLocation,
      };
  }
};

/**
 * Serialize an `OccurrenceIdentity` to a stable string key. Two occurrences
 * with identical identity tuples produce equal strings; differences in any
 * tuple field produce different strings. The encoding uses a delimiter that
 * cannot appear in a relative path or origin tag.
 */
export const occurrenceIdentityKey = (id: OccurrenceIdentity): string =>
  `${id.scope}\u0000${id.subjectKey}\u0000${id.origin}\u0000${id.contentLocation}`;

/**
 * Convenience: collapse an occurrence array to one entry per identity. The
 * first occurrence with a given identity wins; subsequent observations are
 * dropped. Stable ordering: input order is preserved for first-seen entries.
 */
export const dedupeByIdentity = <T extends ScannerOccurrence>(
  occurrences: ReadonlyArray<T>,
): ReadonlyArray<T> => {
  const seen = new Set<string>();
  const out: Array<T> = [];
  for (const occ of occurrences) {
    const key = occurrenceIdentityKey(occurrenceIdentity(occ));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(occ);
  }
  return out;
};
