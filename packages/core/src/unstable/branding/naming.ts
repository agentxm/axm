import type { ExtensionType } from "../extensions/common.js";

export interface CanonicalNamingEntry {
  readonly id: ExtensionType;
  readonly pluralSegment: string;
  readonly displayLabel: string;
  readonly sentenceLabel: string;
  readonly manifestFilename?: string;
}

export const CANONICAL_NAMING = [
  {
    id: "skill",
    pluralSegment: "skills",
    displayLabel: "Skill",
    sentenceLabel: "skill",
  },
  {
    id: "command",
    pluralSegment: "commands",
    displayLabel: "Command",
    sentenceLabel: "command",
  },
  {
    id: "mcp-server",
    pluralSegment: "mcps",
    displayLabel: "MCP Server",
    sentenceLabel: "MCP server",
  },
  {
    id: "subagent",
    pluralSegment: "subagents",
    displayLabel: "Subagent",
    sentenceLabel: "subagent",
  },
  {
    id: "files",
    pluralSegment: "files",
    displayLabel: "Context Files",
    sentenceLabel: "context files",
    manifestFilename: "files.json",
  },
  {
    id: "rule",
    pluralSegment: "rules",
    displayLabel: "Rule",
    sentenceLabel: "rule",
  },
  {
    id: "pack",
    pluralSegment: "packs",
    displayLabel: "Pack",
    sentenceLabel: "pack",
    manifestFilename: "pack.json",
  },
] as const satisfies ReadonlyArray<CanonicalNamingEntry>;

export const NAMING_BY_ID: Record<ExtensionType, CanonicalNamingEntry> = {
  skill: CANONICAL_NAMING[0],
  command: CANONICAL_NAMING[1],
  "mcp-server": CANONICAL_NAMING[2],
  subagent: CANONICAL_NAMING[3],
  files: CANONICAL_NAMING[4],
  rule: CANONICAL_NAMING[5],
  pack: CANONICAL_NAMING[6],
};
