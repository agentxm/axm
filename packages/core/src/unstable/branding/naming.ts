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
    id: "rule",
    pluralSegment: "rules",
    displayLabel: "Rule",
    sentenceLabel: "rule",
  },
  {
    id: "hook",
    pluralSegment: "hooks",
    displayLabel: "Hook",
    sentenceLabel: "hook",
    manifestFilename: "hook.json",
  },
  {
    id: "knowledge",
    pluralSegment: "knowledge",
    displayLabel: "Knowledge",
    sentenceLabel: "knowledge bundle",
    manifestFilename: "knowledge.json",
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
  "mcp-server": CANONICAL_NAMING[1],
  subagent: CANONICAL_NAMING[2],
  rule: CANONICAL_NAMING[3],
  hook: CANONICAL_NAMING[4],
  knowledge: CANONICAL_NAMING[5],
  pack: CANONICAL_NAMING[6],
};
