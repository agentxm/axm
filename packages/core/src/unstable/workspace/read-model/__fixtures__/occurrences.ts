/**
 * Test fixture builders for scanner occurrences.
 *
 * Per the Wave 1A scanner contract, every `CanonicalExtensionOccurrence` and
 * `AgentDirOccurrence` carries `pathSegments`, `subjectFile`, and
 * `subjectFileExists` in addition to its identifying fields. These factories
 * compute those derived fields from minimal inputs so test sites supply only
 * the discriminators they care about.
 *
 * `McpConfigOccurrence` is now a discriminated union on `origin`. The
 * `makeMcpConfigOccurrence` factory accepts the variant tag and returns the
 * correct shape — workspace omits `agentId`; agent carries it non-null.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync, type ExtensionType } from "../../../extensions/common.js";
import { decodeHandleSync } from "../../../extensions/handle.js";
import type { AgentId } from "../../../agents/types.js";
import { AbsolutePathSchema, type AbsolutePath } from "../../../utils/path-types.js";
import type {
  AgentDirOccurrence,
  AgentDirSubjectType,
  AgentMcpConfigOccurrence,
  AgentSettingsOccurrence,
  CanonicalExtensionOccurrence,
  CanonicalExtensionOriginKind,
  WorkspaceMcpConfigOccurrence,
} from "../scanners/types.js";
import type { Scope } from "../types.js";

// ---------------------------------------------------------------------------
// Path helpers (POSIX, since fixtures synthesize POSIX paths)
// ---------------------------------------------------------------------------

const POSIX_SEP = "/";

const splitSegments = (absolute: string): ReadonlyArray<string> => absolute.split(POSIX_SEP);

const join = (parent: string, child: string): string =>
  parent.endsWith(POSIX_SEP) ? `${parent}${child}` : `${parent}${POSIX_SEP}${child}`;

const decodeFixtureAbsolutePath = Schema.decodeUnknownSync(AbsolutePathSchema);

const normalizeFileBackedName = (name: string): string => {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return normalized === "" ? "unnamed" : normalized;
};

// ---------------------------------------------------------------------------
// Subject file mapping (must match scanners/canonical-extensions.ts /
// scanners/agent-dir.ts)
// ---------------------------------------------------------------------------

const subjectFileNameForExtensionType = (type: ExtensionType, name: string): string | null => {
  switch (type) {
    case "skill":
      return "SKILL.md";
    case "subagent":
      return `${name}.md`;
    default:
      return null;
  }
};

const subjectFileNameForAgentDir = (type: AgentDirSubjectType, name: string): string | null => {
  switch (type) {
    case "skill":
      return "SKILL.md";
    case "subagent":
      return `${name}.md`;
  }
};

// ---------------------------------------------------------------------------
// Canonical extension occurrence factory
// ---------------------------------------------------------------------------

export interface MakeCanonicalOccurrenceInput {
  readonly scope: Scope;
  readonly type: ExtensionType;
  readonly origin: CanonicalExtensionOriginKind;
  readonly name: string;
  readonly owner: string | null;
  readonly contentLocation: string;
  /**
   * Override `subjectFileExists`. Defaults to `true` when the subject type has
   * a canonical primary file; `false` otherwise.
   */
  readonly subjectFileExists?: boolean;
}

/**
 * Build a `CanonicalExtensionOccurrence` with the new structural fields
 * populated. `pathSegments` is computed from `contentLocation` (POSIX split).
 * `subjectFile` is `Some(<dir>/<name>.md)` for skill/command/subagent; `None`
 * for mcp-server/file/rule/pack. `subjectFileExists` defaults to `true` when
 * the subject has a canonical primary file; pass `false` to model absence.
 */
export const makeCanonicalOccurrence = (
  input: MakeCanonicalOccurrenceInput,
): CanonicalExtensionOccurrence => {
  const subjectFileName = subjectFileNameForExtensionType(input.type, input.name);
  const contentLocation = decodeFixtureAbsolutePath(input.contentLocation);
  const subjectFile =
    subjectFileName === null
      ? Option.none<AbsolutePath>()
      : Option.some(decodeFixtureAbsolutePath(join(input.contentLocation, subjectFileName)));
  const subjectFileExists = input.subjectFileExists ?? (subjectFileName === null ? false : true);
  return {
    _tag: "canonical-extension",
    scope: input.scope,
    type: input.type,
    origin: input.origin,
    name: decodeExtensionNameSync(input.name),
    owner: input.owner === null ? null : decodeHandleSync(input.owner),
    contentLocation,
    pathSegments: splitSegments(input.contentLocation),
    subjectFile,
    subjectFileExists,
  };
};

// ---------------------------------------------------------------------------
// Agent-dir occurrence factory
// ---------------------------------------------------------------------------

export interface MakeAgentDirOccurrenceInput {
  readonly scope: Scope;
  readonly type: AgentDirSubjectType;
  readonly agentId: AgentId;
  readonly name: string;
  readonly contentLocation: string;
  /**
   * Set to `true` for single-file subagent surfaces (e.g., `.roomodes`) so
   * `subjectFile` is the `contentLocation` itself.
   */
  readonly singleFile?: boolean;
  /**
   * Override `subjectFileExists`. Defaults to `true` (the occurrence exists
   * because the file exists).
   */
  readonly subjectFileExists?: boolean;
}

/**
 * Build an `AgentDirOccurrence` with the new structural fields populated.
 * `pathSegments` is computed from `contentLocation` (POSIX split).
 * `subjectFile` is `<contentLocation>/<canonical-file>` for directory
 * occurrences and the `contentLocation` itself for single-file subagent
 * surfaces. `subjectFileExists` defaults to `true`.
 */
export const makeAgentDirOccurrence = (input: MakeAgentDirOccurrenceInput): AgentDirOccurrence => {
  const resolvedName = input.singleFile === true ? normalizeFileBackedName(input.name) : input.name;
  const subjectFileName = subjectFileNameForAgentDir(input.type, resolvedName);
  const contentLocation = decodeFixtureAbsolutePath(input.contentLocation);
  const subjectFile =
    input.singleFile === true
      ? Option.some(contentLocation)
      : subjectFileName === null
        ? Option.none<AbsolutePath>()
        : Option.some(decodeFixtureAbsolutePath(join(input.contentLocation, subjectFileName)));
  const subjectFileExists = input.subjectFileExists ?? true;
  return {
    _tag: "agent-dir",
    scope: input.scope,
    type: input.type,
    agentId: input.agentId,
    name: resolvedName,
    contentLocation,
    pathSegments: splitSegments(input.contentLocation),
    subjectFile,
    subjectFileExists,
  };
};

// ---------------------------------------------------------------------------
// Mcp-config occurrence factories
// ---------------------------------------------------------------------------

export interface MakeWorkspaceMcpConfigOccurrenceInput {
  readonly scope: Scope;
  readonly name: string;
  readonly contentLocation: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface MakeAgentMcpConfigOccurrenceInput {
  readonly scope: Scope;
  readonly agentId: AgentId;
  readonly name: string;
  readonly contentLocation: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

export const makeWorkspaceMcpConfigOccurrence = (
  input: MakeWorkspaceMcpConfigOccurrenceInput,
): WorkspaceMcpConfigOccurrence => ({
  _tag: "mcp-config",
  scope: input.scope,
  origin: "workspace",
  name: decodeExtensionNameSync(input.name),
  contentLocation: decodeFixtureAbsolutePath(input.contentLocation),
  config: input.config ?? {},
});

export const makeAgentMcpConfigOccurrence = (
  input: MakeAgentMcpConfigOccurrenceInput,
): AgentMcpConfigOccurrence => ({
  _tag: "mcp-config",
  scope: input.scope,
  origin: "agent",
  agentId: input.agentId,
  name: decodeExtensionNameSync(input.name),
  contentLocation: decodeFixtureAbsolutePath(input.contentLocation),
  config: input.config ?? {},
});

// ---------------------------------------------------------------------------
// Agent-settings occurrence factory
// ---------------------------------------------------------------------------

export interface MakeAgentSettingsOccurrenceInput {
  readonly scope: Scope;
  readonly agentId: AgentId;
  readonly contentLocation: string;
}

export const makeAgentSettingsOccurrence = (
  input: MakeAgentSettingsOccurrenceInput,
): AgentSettingsOccurrence => ({
  _tag: "agent-settings",
  scope: input.scope,
  agentId: input.agentId,
  contentLocation: decodeFixtureAbsolutePath(input.contentLocation),
});
