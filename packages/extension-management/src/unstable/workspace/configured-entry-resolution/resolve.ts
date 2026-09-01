import type * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  parseRegistrySourceRef,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { HookExtensionRef } from "../refs/hook.js";
import type { KnowledgeExtensionRef } from "../refs/knowledge.js";
import type { McpServerExtensionRef } from "../refs/mcp-server.js";
import type { PackRef } from "../refs/pack.js";
import type {
  ReleaseAgeBypassRecord,
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
  ReleaseAgeHoldbackRecord,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { parseMinimumReleaseAge } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { RuleExtensionRef } from "../refs/rule.js";
import { resolveSource, SourceHostProviders } from "../../source-resolution/index.js";
import type { SkillExtensionRef } from "../refs/skill.js";
import type { SubagentExtensionRef } from "../refs/subagent.js";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { WorkspaceMutations } from "../service-interface.js";
import { acceptedResolutionRef } from "../accepted-canonical-ref.js";
import { resolveWorkspaceExtensionRef } from "./workspace-ref.js";
import type { ConfiguredRegistryResolution, ResolvedConfiguredEntry } from "./types.js";
import { toAppError } from "../../app-error/conversions.js";

export const makeConfiguredReleaseAgeEvaluation = (mode: "enforce" | "ignore") =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.getMinimumReleaseAge().pipe(Effect.mapError(toAppError));
    const minimumReleaseAge = parseMinimumReleaseAge(configured);
    if (Option.isNone(minimumReleaseAge)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${configured}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }
    const evaluatedAt = yield* DateTime.now;
    const exclude = yield* ws.getMinimumReleaseAgeExclude().pipe(Effect.mapError(toAppError));
    return {
      minimumReleaseAge: minimumReleaseAge.value,
      evaluatedAt,
      mode,
      exclude,
    } satisfies ReleaseAgeEvaluation;
  });

const releaseAgeRecord = (args: {
  readonly target: string;
  readonly versionRange: Option.Option<string>;
  readonly evidence: ReleaseAgeEvidence;
  readonly selectedVersion?: string;
}): ReleaseAgeHoldbackRecord => ({
  reason: "minimum-release-age",
  target: args.target,
  dependencyPath: [args.target],
  ...(Option.isSome(args.versionRange) ? { requestedRange: args.versionRange.value } : {}),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

type ConfiguredRegistryRef = Extract<
  ConfiguredRegistryResolution,
  { readonly kind: "selected" | "exempted" }
>["ref"];

const configuredRegistryResolution = (resolution: ConfiguredRegistryResolution) =>
  Effect.gen(function* () {
    if (resolution.kind === "not_found") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured extension "${resolution.target}" could not be found in its source`,
        suggestions: [{ description: "Verify the configured source or update axm.json." }],
      });
    }
    if (resolution.kind === "version_unsatisfied") {
      return yield* makeAppError({
        code: "conflict",
        title: "No compatible version",
        detail: `${resolution.target} has no visible version satisfying ${resolution.requestedRange}`,
      });
    }
    if (resolution.kind === "policy_held") {
      return yield* makeAppError({
        code: "conflict",
        title: "Release held by minimum release age",
        detail: `${resolution.target}@${resolution.candidate.version} is held by the minimum release age until ${resolution.candidate.eligibleAt}`,
      });
    }

    const holdbacks =
      resolution.kind === "exempted" || resolution.newerHeld === undefined
        ? []
        : [
            releaseAgeRecord({
              target: resolution.target,
              versionRange: resolution.versionRange,
              evidence: resolution.newerHeld,
              selectedVersion: resolution.ref.version,
            }),
          ];
    const bypasses: ReadonlyArray<ReleaseAgeBypassRecord> =
      resolution.kind === "selected"
        ? []
        : [
            {
              ...releaseAgeRecord({
                target: resolution.target,
                versionRange: resolution.versionRange,
                evidence: resolution.bypassed,
                selectedVersion: resolution.ref.version,
              }),
              ...resolution.exemption,
            },
          ];
    return {
      ref: resolution.ref,
      versionRange: resolution.versionRange,
      ...(holdbacks.length === 0 && bypasses.length === 0
        ? {}
        : { releaseAge: { holdbacks, bypasses } }),
    };
  });

const resolveConfiguredRegistryRef = (
  name: string,
  source: string,
  expectedType: ExtensionType,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  resolveConfiguredRegistryEntry(name, source, expectedType, releaseAgeEvaluation).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none<ResolvedConfiguredEntry<ConfiguredRegistryRef>>()),
        onSome: (resolution) =>
          configuredRegistryResolution(resolution).pipe(Effect.map(Option.some)),
      }),
    ),
  );

export const resolveConfiguredRegistryEntry = (
  name: string,
  source: string,
  expectedType: ExtensionType,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
): Effect.Effect<
  Option.Option<ConfiguredRegistryResolution>,
  AppError,
  | SourceHostProviders
  | WorkspaceMutations
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | Scope.Scope
> =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) return Option.none();

    const resolvedSource = yield* resolveSource(source, { expectedType }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid ${expectedType} source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );
    if (resolvedSource.type !== "registry") return Option.none();

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const pluralType = parsedPattern?.type;
    const expectedPlural =
      expectedType === "mcp-server"
        ? "mcps"
        : expectedType === "knowledge"
          ? "knowledge"
          : `${expectedType}s`;
    if (pluralType !== undefined && pluralType !== expectedPlural) {
      return yield* makeAppError({
        code: "validation",
        detail: `Configured ${expectedType} "${name}" uses a ${pluralType} Registry source`,
      });
    }
    if (parsedPattern?.name !== undefined && parsedPattern.name !== name) {
      return yield* makeAppError({
        code: "validation",
        detail: `Configured ${expectedType} "${name}" points to Registry extension "${parsedPattern.name}"`,
      });
    }
    const owner = parsedPattern?.owner ?? Option.getOrUndefined(resolvedSource.owner);
    if (owner === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Configured Registry source for ${expectedType} "${name}" must include an owner`,
      });
    }
    const versionRange = Option.fromUndefinedOr(parsedPattern?.versionRange);
    const workspace = yield* WorkspaceMutations;
    const acceptedRef = yield* acceptedResolutionRef({
      workspace,
      type: expectedType,
      name,
    });
    const accepted = Option.flatMap(acceptedRef, (ref) =>
      ref.refType === "registry" && ref.owner === owner && ref.name === name
        ? Option.some({
            version: ref.version,
            publisherBindingId: ref.publisherBindingId,
          })
        : Option.none(),
    );
    const providers = yield* SourceHostProviders;
    const resolution = yield* providers.resolveNamedRegistry(resolvedSource, {
      name,
      type: expectedType,
      owner,
      versionRange,
      releaseAgeEvaluation,
      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
    });
    const acceptedVersion =
      Option.isSome(accepted) &&
      (resolution.kind === "selected" || resolution.kind === "exempted") &&
      resolution.ref.version === accepted.value.version &&
      resolution.ref.publisherBindingId === accepted.value.publisherBindingId
        ? accepted.value.version
        : undefined;
    return Option.some({
      ...resolution,
      versionRange,
      ...(acceptedVersion === undefined ? {} : { acceptedVersion }),
    });
  });

export const resolveConfiguredSkill = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "skill",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "skill") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace skill resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "skill",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "skill") {
        return yield* makeAppError({ code: "internal", detail: "Registry returned a non-skill" });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source, { expectedType: "skill" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid skill source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "skills"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "skills"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "skill",
        owner: requestedOwner,
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is SkillExtensionRef => entry.type === "skill"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured skill "${name}"`,
            suggestions: [
              {
                description: `Verify the configured source is reachable and still contains the skill.`,
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.skill.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured skill "${name}" could not be found in its source`,
        suggestions: [
          {
            description: `Verify the configured source still contains the skill or update axm.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredSubagent = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "subagent",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "subagent") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace subagent resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "subagent",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "subagent") {
        return yield* makeAppError({
          code: "internal",
          detail: "Registry returned a non-subagent",
        });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source, { expectedType: "subagent" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid subagent source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "subagents"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "subagents"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "subagent",
        owner: requestedOwner,
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is SubagentExtensionRef => entry.type === "subagent"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured subagent "${name}"`,
            suggestions: [
              {
                description: `Verify the configured source is reachable and still contains the subagent.`,
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.subagent.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured subagent "${name}" could not be found in its source`,
        suggestions: [
          {
            description: `Verify the configured source still contains the subagent or update axm.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredRule = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "rule",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "rule") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace rule resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "rule",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "rule") {
        return yield* makeAppError({ code: "internal", detail: "Registry returned a non-rule" });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source, { expectedType: "rule" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid rule source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "rules"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "rules"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "rule",
        owner: requestedOwner,
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is RuleExtensionRef => entry.type === "rule"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured rule "${name}"`,
            suggestions: [
              {
                description:
                  "Verify the configured source is reachable and still contains the rule.",
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.rule.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured rule "${name}" could not be found in its source`,
        suggestions: [
          {
            description: "Verify the configured source still contains the rule or update axm.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredHook = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "hook",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "hook") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace hook resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "hook",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "hook") {
        return yield* makeAppError({ code: "internal", detail: "Registry returned a non-hook" });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source, { expectedType: "hook" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid hook source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "hooks"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "hooks"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "hook",
        owner: requestedOwner,
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is HookExtensionRef => entry.type === "hook"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured hook "${name}"`,
            suggestions: [
              {
                description:
                  "Verify the configured source is reachable and still contains the hook.",
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.hook.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured hook "${name}" could not be found in its source`,
        suggestions: [
          {
            description: "Verify the configured source still contains the hook or update axm.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredKnowledge = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "knowledge",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "knowledge") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace knowledge resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "knowledge",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "knowledge") {
        return yield* makeAppError({
          code: "internal",
          detail: "Registry returned non-knowledge content",
        });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source, { expectedType: "knowledge" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid knowledge source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );
    const parsedPattern = parseSourceQualifiedRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "knowledge"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "knowledge"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "knowledge",
        owner: requestedOwner,
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is KnowledgeExtensionRef => entry.type === "knowledge"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured knowledge bundle "${name}"`,
            cause,
          }),
        ),
      );
    const ref = refs.find((entry) => entry.knowledge.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured knowledge bundle "${name}" could not be found in its source`,
      });
    }
    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredMcpServer = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "mcp-server",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "mcp-server") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace MCP server resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "mcp-server",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "mcp-server") {
        return yield* makeAppError({
          code: "internal",
          detail: "Registry returned a non-MCP-server",
        });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const parsed = parseRegistrySourceRef(source);

    if (parsed === undefined || parsed.type !== "mcps" || parsed.name !== name) {
      return yield* makeAppError({
        code: "validation",
        detail: `The configured MCP server entry "${name}" is invalid.`,
        suggestions: [{ description: `Use a name like "@owner/mcps/name".` }],
      });
    }

    const providers = yield* SourceHostProviders;
    const versionRange = Option.fromUndefinedOr(parsed.versionRange);
    const resolvedSource = yield* resolveSource(source, { expectedType: "mcp-server" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid MCP server source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "mcp-server",
        owner: Option.some(parsed.owner),
        versionRange,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is McpServerExtensionRef => entry.type === "mcp-server"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured MCP server "${name}"`,
            suggestions: [
              {
                description: `Verify the configured registry source is reachable and still contains the MCP server.`,
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.server.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured MCP server "${name}" could not be found in its source`,
        suggestions: [
          {
            description: `Verify the configured source still contains the MCP server or update axm.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange,
    };
  });

export const resolveConfiguredPack = (
  name: string,
  source: string,
  releaseAgeEvaluation: ReleaseAgeEvaluation,
) =>
  Effect.gen(function* () {
    if (isWorkspaceSourceLocator(source)) {
      const ws = yield* WorkspaceMutations;
      const ref = yield* resolveWorkspaceExtensionRef({
        settingsName: name,
        source,
        expectedType: "pack",
        layout: ws.layout,
        scope: ws.scope,
      });
      if (ref.type !== "pack") {
        return yield* makeAppError({
          code: "internal",
          detail: `Workspace pack resolution returned ${ref.type}`,
        });
      }
      return { ref, versionRange: Option.none<VersionRange>() };
    }
    const registry = yield* resolveConfiguredRegistryRef(
      name,
      source,
      "pack",
      releaseAgeEvaluation,
    );
    if (Option.isSome(registry)) {
      if (registry.value.ref.type !== "pack") {
        return yield* makeAppError({ code: "internal", detail: "Registry returned a non-pack" });
      }
      return { ...registry.value, ref: registry.value.ref };
    }
    const parsed = parseRegistrySourceRef(source);

    if (parsed === undefined || parsed.type !== "packs" || parsed.name !== name) {
      return yield* makeAppError({
        code: "validation",
        detail: `The configured pack entry "${name}" is invalid.`,
        suggestions: [{ description: `Use a name like "@owner/packs/name".` }],
      });
    }

    const providers = yield* SourceHostProviders;
    const versionRange = Option.fromUndefinedOr(parsed.versionRange);
    const resolvedSource = yield* resolveSource(source, { expectedType: "pack" }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid pack source for ${name}: ${cause.detail}`,
          cause,
        }),
      ),
    );

    const findWith = (candidate: typeof resolvedSource) =>
      providers.find(candidate, {
        names: [name],
        type: "pack",
        owner: Option.some(parsed.owner),
        versionRange,
      });

    const refs = yield* findWith(resolvedSource).pipe(
      Effect.map((entries) => entries.filter((entry): entry is PackRef => entry.type === "pack")),
      Effect.catch((error) =>
        resolvedSource.type === "registry"
          ? Effect.gen(function* () {
              const ws = yield* WorkspaceMutations;
              const registryHosts = yield* ws.getRegistrySourceHosts();
              const fallbackSources = registryHosts
                .filter((host) => host.location.protocol === "file:")
                .map((host) => ({
                  type: "registry" as const,
                  name: host.name,
                  location: host.location,
                  owner: Option.some(parsed.owner),
                }));

              for (const fallback of fallbackSources) {
                if (fallback.location.href === resolvedSource.location.href) {
                  continue;
                }

                const fallbackResult = yield* findWith(fallback).pipe(Effect.result);
                if (fallbackResult._tag === "Success" && fallbackResult.success.length > 0) {
                  return fallbackResult.success.filter(
                    (entry): entry is PackRef => entry.type === "pack",
                  );
                }
              }

              return yield* error;
            })
          : Effect.fail(error),
      ),
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to resolve configured pack "${name}"`,
          suggestions: [
            {
              description:
                "Verify the configured registry source is reachable and still contains the pack.",
            },
          ],
          cause,
        }),
      ),
    );

    const ref = refs.find((entry) => entry.pack.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured pack "${name}" could not be found in its source`,
        suggestions: [
          {
            description: "Verify the configured source still contains the pack or update axm.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange,
    };
  });
