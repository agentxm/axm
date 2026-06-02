/**
 * Catalog validation shared by codegen and tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { capabilityKinds, capabilityWorks } from "./derive.js";
import type { CapabilityKind } from "./derive.js";
import type { Agent, AgentCapability } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export interface CatalogSource {
  readonly filename: string;
  readonly agent: Agent;
}

/** @experimental This API is unstable and may change without notice. */
export interface CatalogValidationIssue {
  readonly path: string;
  readonly message: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const capabilityEntry = (
  agent: Agent,
  kind: CapabilityKind,
): { readonly kind: CapabilityKind; readonly capability: AgentCapability } | undefined => {
  switch (kind) {
    case "skills":
      return agent.skills === undefined ? undefined : { kind, capability: agent.skills };
    case "commands":
      return agent.commands === undefined ? undefined : { kind, capability: agent.commands };
    case "mcp":
      return agent.mcp === undefined ? undefined : { kind, capability: agent.mcp };
    case "subagents":
      return agent.subagents === undefined ? undefined : { kind, capability: agent.subagents };
    case "instructions":
      return agent.instructions === undefined
        ? undefined
        : { kind, capability: agent.instructions };
    case "rules":
      return agent.rules === undefined ? undefined : { kind, capability: agent.rules };
    case "hooks":
      return agent.hooks === undefined ? undefined : { kind, capability: agent.hooks };
    case "permissions":
      return agent.permissions === undefined ? undefined : { kind, capability: agent.permissions };
    default:
      return kind satisfies never;
  }
};

const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const pushUrlIssue = (issues: Array<CatalogValidationIssue>, path: string, value: string): void => {
  if (!isUrl(value)) {
    issues.push({ path, message: `Expected URL, got ${value}` });
  }
};

const validateCapability = (
  issues: Array<CatalogValidationIssue>,
  source: CatalogSource,
  kind: CapabilityKind,
  capability: AgentCapability,
): void => {
  const prefix = `${source.filename}:${kind}`;
  if (capability.lifecycle !== "unknown") {
    if (capability.sources === undefined || capability.sources.length === 0) {
      issues.push({ path: prefix, message: "Capability claims require at least one source." });
    }
    if (capability.lastVerified === undefined) {
      issues.push({ path: prefix, message: "Capability claims require lastVerified." });
    }
  }

  for (const [index, sourceUrl] of (capability.sources ?? []).entries()) {
    pushUrlIssue(issues, `${prefix}.sources[${index}]`, sourceUrl);
  }

  for (const [index, doc] of (capability.docs ?? []).entries()) {
    pushUrlIssue(issues, `${prefix}.docs[${index}].url`, doc.url);
  }

  if (capability.lastVerified !== undefined && !ISO_DATE_PATTERN.test(capability.lastVerified)) {
    issues.push({ path: `${prefix}.lastVerified`, message: "Expected ISO date YYYY-MM-DD." });
  }

  if (kind === "instructions" && "files" in capability) {
    const files = capability.files;
    if (capability.kind === "agents-md" && (files.length !== 1 || files[0] !== "AGENTS.md")) {
      issues.push({
        path: `${prefix}.files`,
        message: 'instructions.kind "agents-md" requires files [AGENTS.md].',
      });
    }
    if (capability.kind === "own-file" && files.length !== 1) {
      issues.push({
        path: `${prefix}.files`,
        message: 'instructions.kind "own-file" requires exactly one file.',
      });
    }
    if (capability.kind === "rules-dir" && source.agent.rules?.directory === undefined) {
      issues.push({
        path: `${prefix}.kind`,
        message: 'instructions.kind "rules-dir" requires rules.directory.',
      });
    }
  }

  if (kind === "subagents" && "layout" in capability) {
    if (capabilityWorks(capability) && capability.directory === undefined) {
      issues.push({
        path: `${prefix}.directory`,
        message: "Supported subagents require directory.",
      });
    }
  }

  if (kind === "commands") {
    const commands = source.agent.commands;
    if (commands !== undefined && capabilityWorks(commands) && commands.directory === undefined) {
      issues.push({
        path: `${prefix}.directory`,
        message: "Supported commands require directory.",
      });
    }
  }

  if (kind === "mcp" && "transports" in capability) {
    const config = capability.config;
    if (capability.standardsCompliance === "full" && config === undefined) {
      issues.push({
        path: `${prefix}.config`,
        message: "Full MCP standards compliance must declare config.",
      });
    }
    if (capability.standardsCompliance !== "full" && config !== undefined) {
      issues.push({
        path: `${prefix}.config`,
        message: "MCP config is only valid for full standards compliance.",
      });
    }
    if (config !== undefined) {
      if (capability.transports.includes("stdio") && config.stdio === undefined) {
        issues.push({
          path: `${prefix}.config.stdio`,
          message: "MCP stdio config is required when stdio transport is supported.",
        });
      }
      if (
        (capability.transports.includes("http") || capability.transports.includes("sse")) &&
        config.remote === undefined
      ) {
        issues.push({
          path: `${prefix}.config.remote`,
          message: "MCP remote config is required when http or sse transport is supported.",
        });
      }
    }
  }
};

/** @experimental This API is unstable and may change without notice. */
export const validateCatalogSources = (
  sources: ReadonlyArray<CatalogSource>,
): ReadonlyArray<CatalogValidationIssue> => {
  const issues: Array<CatalogValidationIssue> = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    const expectedFilename = `${source.agent.id}.yaml`;
    if (source.filename !== expectedFilename) {
      issues.push({
        path: source.filename,
        message: `Agent id ${source.agent.id} must match filename ${expectedFilename}.`,
      });
    }

    if (seenIds.has(source.agent.id)) {
      issues.push({ path: source.filename, message: `Duplicate agent id ${source.agent.id}.` });
    }
    seenIds.add(source.agent.id);

    pushUrlIssue(issues, `${source.filename}:homepage`, source.agent.homepage);
    for (const [index, doc] of (source.agent.docs ?? []).entries()) {
      pushUrlIssue(issues, `${source.filename}:docs[${index}].url`, doc.url);
    }

    for (const kind of capabilityKinds) {
      const entry = capabilityEntry(source.agent, kind);
      if (entry !== undefined) {
        validateCapability(issues, source, entry.kind, entry.capability);
      }
    }
  }

  return issues;
};
