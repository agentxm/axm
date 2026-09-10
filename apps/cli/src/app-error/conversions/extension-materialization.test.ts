/**
 * Byte-for-byte conversion table for the extension-materialization typed failure family.
 * Each row travels the real `toAppError` path and pins the envelope its
 * construction site rendered before decoupling; a wording change in the
 * producing module fails here rather than silently reaching the terminal.
 */

import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, type AppErrorCode } from "../app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "../conversions.js";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  LifecyclePostconditionViolated,
  McpInstallStateMissing,
  McpRegistryOnlyInstall,
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  PackageCopyFailed,
  PackageMaterializationFailed,
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  ScaffoldedExtensionUnresolved,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  StagedPackageInvalid,
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
} from "@agentxm/extension-materialization";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly title?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "PackageMaterializationFailed recover",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "recover", cause: ioCause }),
    code: "internal",
    detail: "Failed to recover interrupted canonical materialization at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed prepare-parent",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg",
      step: "prepare-parent",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to prepare canonical package parent for /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed prepare-staging",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg.axm-staging",
      step: "prepare-staging",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to prepare canonical package staging at /w/pkg.axm-staging",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed inspect",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect canonical package at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed replace",
    failure: new PackageMaterializationFailed({ path: "/w/pkg", step: "replace", cause: ioCause }),
    code: "internal",
    detail: "Failed to replace canonical package at /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageMaterializationFailed inspect-create-destination",
    failure: new PackageMaterializationFailed({
      path: "/w/pkg",
      step: "inspect-create-destination",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to inspect create-only destination: /w/pkg",
    cause: ioCause,
  },
  {
    name: "StagedPackageInvalid missing",
    failure: new StagedPackageInvalid({ file: "skill.json", kind: "missing", cause: ioCause }),
    code: "validation",
    detail: "Staged package is missing required file: skill.json",
    cause: ioCause,
  },
  {
    name: "StagedPackageInvalid not-file",
    failure: new StagedPackageInvalid({ file: "skill.json", kind: "not-file" }),
    code: "validation",
    detail: "Staged package path is not a file: skill.json",
  },
  {
    name: "CanonicalPackageProbeFailed",
    failure: new CanonicalPackageProbeFailed({
      detail: "Failed to check if canonical path exists: /w/pkg",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to check if canonical path exists: /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageCopyFailed internal",
    failure: new PackageCopyFailed({
      severity: "internal",
      detail: "Failed to copy skill files to /w/pkg",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to copy skill files to /w/pkg",
    cause: ioCause,
  },
  {
    name: "PackageCopyFailed validation",
    failure: new PackageCopyFailed({
      severity: "validation",
      detail: "Failed to copy rule package files to /w/pkg",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to copy rule package files to /w/pkg",
    cause: ioCause,
  },
  {
    name: "ArchiveIntegrityMismatch",
    failure: new ArchiveIntegrityMismatch({ subject: "Integrity mismatch for demo@1.0.0" }),
    code: "validation",
    detail:
      "Integrity mismatch for demo@1.0.0 — the fetched archive does not match the accepted integrity. Verify the source and rerun, or update to accept a republished version.",
  },
  {
    name: "CreateDestinationExists",
    failure: new CreateDestinationExists({ subject: "Skill", path: "/w/skills/demo" }),
    code: "conflict",
    detail: "Skill destination already exists: /w/skills/demo",
    suggestions: [
      { description: "Choose a different name or remove the existing directory first" },
    ],
  },
  {
    name: "LifecyclePostconditionViolated install-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "install-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Installed skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated install-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "install-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Installed skill "demo" has no desired-state declaration',
  },
  {
    name: "LifecyclePostconditionViolated new-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "new-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'New skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated new-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "new-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'New skill "demo" has no desired-state declaration',
  },
  {
    name: "LifecyclePostconditionViolated materialize-observable",
    failure: new LifecyclePostconditionViolated({
      postcondition: "materialize-observable",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Reconciled skill "demo" did not satisfy its observable contract',
  },
  {
    name: "LifecyclePostconditionViolated uninstall-remains-declared",
    failure: new LifecyclePostconditionViolated({
      postcondition: "uninstall-remains-declared",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Uninstalled skill "demo" remains declared',
  },
  {
    name: "LifecyclePostconditionViolated uninstall-observed-state",
    failure: new LifecyclePostconditionViolated({
      postcondition: "uninstall-observed-state",
      targetType: "skill",
      targetName: "demo",
    }),
    code: "internal",
    detail: 'Uninstalled skill "demo" has an invalid observed postcondition',
  },
  {
    name: "ScaffoldedExtensionUnresolved",
    failure: new ScaffoldedExtensionUnresolved({ targetType: "skill", targetName: "demo" }),
    code: "not_found",
    detail: 'Newly scaffolded skill "demo" could not be resolved from its workspace source',
  },
  {
    name: "RuleDefinitionInvalid",
    failure: new RuleDefinitionInvalid({ detail: "Failed to read rule.json", cause: ioCause }),
    code: "validation",
    detail: "Failed to read rule.json",
    cause: ioCause,
  },
  {
    name: "RuleInstallStateMissing tree-integrity",
    failure: new RuleInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Rule demo has no materialized tree integrity",
  },
  {
    name: "RuleInstallStateMissing content-identity",
    failure: new RuleInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Rule demo has no materialized content identity",
  },
  {
    name: "HookDefinitionInvalid",
    failure: new HookDefinitionInvalid({ detail: "Hook entrypoint does not exist: run.sh" }),
    code: "validation",
    detail: "Hook entrypoint does not exist: run.sh",
  },
  {
    name: "HookInstallStateMissing tree-integrity",
    failure: new HookInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Hook demo has no materialized tree integrity",
  },
  {
    name: "HookInstallStateMissing content-identity",
    failure: new HookInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Hook demo has no materialized content identity",
  },
  {
    name: "SubagentDefinitionInvalid",
    failure: new SubagentDefinitionInvalid({
      detail: "Workspace subagent source is missing: /w/authored/demo/src",
    }),
    code: "validation",
    detail: "Workspace subagent source is missing: /w/authored/demo/src",
  },
  {
    name: "SubagentContentUnreadable",
    failure: new SubagentContentUnreadable({
      expectedFilename: "demo.md",
      subagentSrcPath: "/w/subagents/demo/src",
      contentPath: "/w/subagents/demo/src/demo.md",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to read demo.md from /w/subagents/demo/src",
    suggestions: [
      {
        description: "Ensure the subagent content file exists at /w/subagents/demo/src/demo.md.",
      },
    ],
    cause: ioCause,
  },
  {
    name: "SubagentInstallStateMissing content-identity",
    failure: new SubagentInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Subagent demo has no materialized content identity",
  },
  {
    name: "SubagentInstallStateMissing external-resolution",
    failure: new SubagentInstallStateMissing({ name: "demo", kind: "external-resolution" }),
    code: "internal",
    detail: "Subagent demo did not produce an external resolution",
  },
  {
    name: "McpRegistryOnlyInstall",
    failure: new McpRegistryOnlyInstall({ serverName: "demo", refType: "workspace" }),
    code: "usage",
    detail: "MCP servers materialize from a registry package, not from a workspace source",
    suggestions: [
      { description: "Install from the registry", cmd: "axm mcps install @owner/mcps/demo" },
    ],
  },
  {
    name: "McpInstallStateMissing",
    failure: new McpInstallStateMissing({ name: "demo" }),
    code: "internal",
    detail: "MCP server demo has no materialized tree integrity",
  },
  {
    name: "SkillDefinitionInvalid",
    failure: new SkillDefinitionInvalid({
      detail: "One or more configured agents have invalid skills directory settings",
    }),
    code: "validation",
    detail: "One or more configured agents have invalid skills directory settings",
  },
  {
    name: "SkillMaterializationFailed",
    failure: new SkillMaterializationFailed({
      detail: "Failed to remove skill artifact at /w/.claude/skills/demo",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to remove skill artifact at /w/.claude/skills/demo",
    cause: ioCause,
  },
  {
    name: "SkillInstallStateMissing tree-integrity",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Skill demo has no materialized tree integrity",
  },
  {
    name: "SkillInstallStateMissing content-identity",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Skill demo has no materialized content identity",
  },
  {
    name: "SkillInstallStateMissing external-resolution",
    failure: new SkillInstallStateMissing({ name: "demo", kind: "external-resolution" }),
    code: "internal",
    detail: "Skill demo did not produce an external resolution",
  },
  {
    name: "PackDefinitionInvalid",
    failure: new PackDefinitionInvalid({
      detail: "Workspace pack package is missing: /w/packs/demo",
    }),
    code: "validation",
    detail: "Workspace pack package is missing: /w/packs/demo",
  },
  {
    name: "PackInstallStateMissing",
    failure: new PackInstallStateMissing({ name: "demo" }),
    code: "internal",
    detail: "Pack demo has no materialized tree integrity",
  },
  {
    name: "PackArchiveFetchFailed",
    failure: new PackArchiveFetchFailed({ message: "connection reset", cause: ioCause }),
    code: "network",
    detail: "Failed to fetch pack archive: connection reset",
    cause: ioCause,
  },
  {
    name: "PackStagingFailed",
    failure: new PackStagingFailed({ packDir: "/w/packs/demo", cause: ioCause }),
    code: "internal",
    detail: "Failed to stage pack at /w/packs/demo",
    cause: ioCause,
  },
  {
    name: "KnowledgeDefinitionInvalid",
    failure: new KnowledgeDefinitionInvalid({
      detail: "Failed to parse knowledge.json",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to parse knowledge.json",
    cause: ioCause,
  },
  {
    name: "KnowledgeIoFailed",
    failure: new KnowledgeIoFailed({
      detail: "Failed to stage Knowledge bundle demo",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to stage Knowledge bundle demo",
    cause: ioCause,
  },
  {
    name: "KnowledgeInstallStateMissing tree-integrity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "tree-integrity" }),
    code: "internal",
    detail: "Knowledge demo has no materialized tree integrity",
  },
  {
    name: "KnowledgeInstallStateMissing content-identity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "content-identity" }),
    code: "internal",
    detail: "Knowledge demo has no materialized content identity",
  },
  {
    name: "KnowledgeInstallStateMissing staged-tree-integrity",
    failure: new KnowledgeInstallStateMissing({ name: "demo", kind: "staged-tree-integrity" }),
    code: "internal",
    detail: "Knowledge demo has no staged tree integrity",
  },
  {
    name: "KnowledgeResolutionMissing",
    failure: new KnowledgeResolutionMissing({ name: "demo" }),
    code: "conflict",
    detail: "Active external Knowledge bundle has no accepted resolution: demo",
  },
  {
    name: "KnowledgeDesiredStateUnreconcilable",
    failure: new KnowledgeDesiredStateUnreconcilable(),
    code: "conflict",
    detail:
      "Knowledge desired state cannot be reconciled until pack and declaration problems are fixed",
  },
  {
    name: "KnowledgeUnavailable",
    failure: new KnowledgeUnavailable({
      detail: "Locked registry Knowledge bundle has no integrity and cannot be restored: demo",
    }),
    code: "unavailable",
    detail: "Locked registry Knowledge bundle has no integrity and cannot be restored: demo",
  },
  {
    name: "KnowledgeObservableContractViolated",
    failure: new KnowledgeObservableContractViolated({ name: "demo" }),
    code: "internal",
    detail: 'Installed Knowledge bundle "demo" did not satisfy its observable contract',
  },
];

describe("extension-materialization conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.title !== undefined) {
        expect(converted.title).toBe(entry.title);
      }
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });
});
