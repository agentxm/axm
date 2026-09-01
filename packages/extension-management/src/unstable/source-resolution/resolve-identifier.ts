import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Result from "effect/Result";

import { makeAppError, type AppError } from "../app-error/index.js";
import {
  isCatalogExtensionType,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types/schema";
import {
  decodeExtensionNameSync,
  extensionTypePluralSentenceLabels,
  formatFqn,
  parseExtensionFqnParts,
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionTypePlural,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { createRegistryClient } from "../registry/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { toAppError } from "../app-error/conversions.js";

/**
 * Every non-pack extension type an installed identifier can name. Packs are
 * excluded because they are containers: a pack has no per-type lock map of its
 * own to resolve a bare name against.
 */
export type IdentifierResourceType = CatalogExtensionType;
export type IdentifierResolutionScope = "installed" | "registry" | "both";

export interface ResolvedIdentifier {
  readonly input: string;
  readonly owner: Option.Option<Handle>;
  readonly type: IdentifierResourceType;
  readonly name: ExtensionName;
  readonly fqn: string;
  readonly installedName: Option.Option<string>;
  readonly registryLocation: Option.Option<URL>;
  readonly registrySourceName: Option.Option<string>;
  readonly source: "installed" | "registry" | "passthrough";
}

export interface ResolveIdentifierArgs {
  readonly input: string;
  readonly resourceType: IdentifierResourceType;
  readonly scope: IdentifierResolutionScope;
  readonly registrySourceName: string;
}

interface IdentifierCandidate {
  readonly owner: Option.Option<Handle>;
  readonly type: IdentifierResourceType;
  readonly name: ExtensionName;
  readonly fqn: string;
  readonly installedName: Option.Option<string>;
  readonly registryLocation: Option.Option<URL>;
  readonly registrySourceName: Option.Option<string>;
  readonly source: "installed" | "registry";
}

interface IdentifierParts {
  readonly owner: Handle;
  readonly type: IdentifierResourceType;
  readonly name: ExtensionName;
}

const isIdentifierResourceType = (type: ExtensionType): type is IdentifierResourceType =>
  isCatalogExtensionType(type);

const decodeName = (input: string) =>
  Effect.try({
    try: () => decodeExtensionNameSync(input),
    catch: () =>
      makeAppError({
        code: "not_found",
        detail: `No ${input} identifier could be resolved`,
        suggestions: [
          {
            description:
              "Use a valid bare name, or use a fully-qualified name like @owner/skills/name.",
          },
        ],
      }),
  });

const makeCandidate = (
  parts: IdentifierParts,
  installedName: Option.Option<string>,
  source: "installed" | "registry",
): IdentifierCandidate => ({
  owner: Option.some(parts.owner),
  type: parts.type,
  name: parts.name,
  fqn: formatFqn(parts),
  installedName,
  registryLocation: Option.none(),
  registrySourceName: Option.none(),
  source,
});

const configuredSourceParts = (
  resourceType: IdentifierResourceType,
  source: string,
): Option.Option<IdentifierParts> => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parsed === undefined || parsed.name === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== toExtensionTypePlural(resourceType)) {
    return Option.none();
  }
  return Option.some({
    owner: parsed.owner,
    type: resourceType,
    name: parsed.name,
  });
};

const matchesInput = (input: string, candidate: IdentifierCandidate): boolean =>
  candidate.fqn === input ||
  candidate.name === input ||
  (Option.isSome(candidate.installedName) && candidate.installedName.value === input);

const dedupeCandidates = (
  candidates: ReadonlyArray<IdentifierCandidate>,
): ReadonlyArray<IdentifierCandidate> => {
  const deduped: IdentifierCandidate[] = [];
  const chooseCandidate = (existing: IdentifierCandidate, next: IdentifierCandidate) => {
    if (Option.isNone(existing.owner) && Option.isSome(next.owner)) return next;
    return existing;
  };

  for (const candidate of candidates) {
    if (Option.isSome(candidate.installedName)) {
      const candidateInstalledName = candidate.installedName.value;
      const existingIndex = deduped.findIndex(
        (entry) =>
          Option.isSome(entry.installedName) &&
          entry.installedName.value === candidateInstalledName,
      );
      const existing = deduped[existingIndex];
      if (existing !== undefined) {
        deduped[existingIndex] = chooseCandidate(existing, candidate);
        continue;
      }
    }

    const existingFqnIndex = deduped.findIndex((entry) => entry.fqn === candidate.fqn);
    const existingFqn = deduped[existingFqnIndex];
    if (existingFqn !== undefined) {
      deduped[existingFqnIndex] = chooseCandidate(existingFqn, candidate);
      continue;
    }

    deduped.push(candidate);
  }
  return deduped;
};

const installedCandidates = (
  input: string,
  resourceType: IdentifierResourceType,
): Effect.Effect<ReadonlyArray<IdentifierCandidate>, AppError, WorkspaceMutations> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const candidates: IdentifierCandidate[] = [];

    const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
    if (!graph.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail:
          "The desired extension graph is incomplete, so installed identifiers cannot be resolved safely.",
        suggestions: [
          {
            description: "Repair or reinstall the configured packs, then retry.",
            cmd: "axm sync",
          },
        ],
      });
    }

    for (const node of graph.nodes) {
      if (node.type !== resourceType) continue;
      if (node.source === undefined) continue;
      const graphIdentity = node.identity.startsWith("workspace:")
        ? node.identity.slice("workspace:".length)
        : node.identity;
      const parsedIdentity = parseExtensionFqnParts(graphIdentity);
      const parts =
        parsedIdentity !== undefined && parsedIdentity.type === resourceType
          ? Option.some({
              owner: parsedIdentity.owner,
              type: resourceType,
              name: parsedIdentity.name,
            })
          : configuredSourceParts(resourceType, node.source);
      if (Option.isSome(parts)) {
        candidates.push(makeCandidate(parts.value, Option.some(node.name), "installed"));
      } else if (node.name === input) {
        const decodedName = yield* decodeName(node.name);
        candidates.push({
          owner: Option.none<Handle>(),
          type: resourceType,
          name: decodedName,
          fqn: node.name,
          installedName: Option.some(node.name),
          registryLocation: Option.none(),
          registrySourceName: Option.none(),
          source: "installed",
        });
      }
    }

    return dedupeCandidates(candidates).filter((candidate) => matchesInput(input, candidate));
  });

const registryCandidates = (
  input: string,
  resourceType: IdentifierResourceType,
  registrySourceName: string,
): Effect.Effect<
  ReadonlyArray<IdentifierCandidate>,
  AppError,
  WorkspaceMutations | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    const name = yield* decodeName(input);
    const ws = yield* WorkspaceMutations;
    const registrySources = (yield* ws
      .getRegistrySourceHosts()
      .pipe(Effect.mapError(toAppError))).filter((source) => source.name === registrySourceName);

    const results = yield* Effect.forEach(
      registrySources,
      (sourceConfig) =>
        Effect.gen(function* () {
          const location =
            sourceConfig.location.protocol === "file:"
              ? sourceConfig.location.pathname
              : sourceConfig.location.href;
          const client = yield* createRegistryClient(location);
          const result = yield* client.getExtensionsByScope({
            owner: "*",
            names: [name],
            types: [resourceType],
            limit: Option.none(),
            offset: 0,
          });
          return result.extensions.map((entry) => ({
            ...makeCandidate(
              {
                owner: entry.owner,
                type: resourceType,
                name: entry.name,
              },
              Option.none(),
              "registry",
            ),
            registryLocation: Option.some(sourceConfig.location),
            registrySourceName: Option.some(sourceConfig.name),
          }));
        }).pipe(Effect.result),
      { concurrency: "unbounded" },
    );

    return dedupeCandidates(
      Array.flatten(
        Array.getSuccesses(results).map((result) =>
          result.filter((candidate) => candidate.name === name),
        ),
      ),
    );
  });

const notFound = (
  input: string,
  resourceType: IdentifierResourceType,
  scope: IdentifierResolutionScope,
) =>
  makeAppError({
    code: "not_found",
    detail: `"${input}" did not match any ${extensionTypePluralSentenceLabels[toExtensionTypePlural(resourceType)]} in ${scope} scope`,
    suggestions: [{ description: "Check the name, or re-run with a fully-qualified name." }],
  });

const ambiguous = (
  input: string,
  resourceType: IdentifierResourceType,
  scope: IdentifierResolutionScope,
  candidates: ReadonlyArray<IdentifierCandidate>,
) =>
  makeAppError({
    code: "internal",
    detail: `"${input}" matches more than one ${scope} ${extensionTypePluralSentenceLabels[toExtensionTypePlural(resourceType)]}: ${candidates.map((candidate) => candidate.fqn).join(", ")}`,
    suggestions: [{ description: "Re-run with the fully-qualified name." }],
  });

const resolveFromCandidates = (
  input: string,
  resourceType: IdentifierResourceType,
  scope: IdentifierResolutionScope,
  candidates: ReadonlyArray<IdentifierCandidate>,
) =>
  Effect.gen(function* () {
    if (candidates.length === 0) {
      return yield* notFound(input, resourceType, scope);
    }
    if (candidates.length > 1) {
      return yield* ambiguous(input, resourceType, scope, candidates);
    }
    const [candidate] = candidates;
    if (candidate === undefined) {
      return yield* notFound(input, resourceType, scope);
    }
    return {
      input,
      owner: candidate.owner,
      type: candidate.type,
      name: candidate.name,
      fqn: candidate.fqn,
      installedName: candidate.installedName,
      registryLocation: candidate.registryLocation,
      registrySourceName: candidate.registrySourceName,
      source: candidate.source,
    } satisfies ResolvedIdentifier;
  });

export const resolveIdentifier = (args: ResolveIdentifierArgs) =>
  Effect.gen(function* () {
    const trimmed = args.input.trim();
    const parsed = parseExtensionFqnParts(trimmed);
    if (parsed !== undefined) {
      if (!isIdentifierResourceType(parsed.type) || parsed.type !== args.resourceType) {
        return yield* makeAppError({
          code: "not_found",
          detail: `"${trimmed}" is not a ${args.resourceType} identifier`,
          suggestions: [
            {
              description: `Use a ${args.resourceType} identifier like @owner/${toExtensionTypePlural(args.resourceType)}/name.`,
            },
          ],
        });
      }

      if (args.scope === "installed" || args.scope === "both") {
        const installed = yield* installedCandidates(trimmed, args.resourceType);
        if (installed.length > 0) {
          return yield* resolveFromCandidates(trimmed, args.resourceType, "installed", installed);
        }
        if (args.scope === "installed") {
          return yield* notFound(trimmed, args.resourceType, args.scope);
        }
      }

      return {
        input: trimmed,
        owner: Option.some(parsed.owner),
        type: args.resourceType,
        name: parsed.name,
        fqn: formatFqn(parsed),
        installedName: Option.some(parsed.name),
        registryLocation: Option.none(),
        registrySourceName: Option.some(args.registrySourceName),
        source: "passthrough" as const,
      } satisfies ResolvedIdentifier;
    }

    switch (args.scope) {
      case "installed": {
        const candidates = yield* installedCandidates(trimmed, args.resourceType);
        return yield* resolveFromCandidates(trimmed, args.resourceType, args.scope, candidates);
      }
      case "registry": {
        const candidates = yield* registryCandidates(
          trimmed,
          args.resourceType,
          args.registrySourceName,
        );
        return yield* resolveFromCandidates(trimmed, args.resourceType, args.scope, candidates);
      }
      case "both": {
        const installed = yield* installedCandidates(trimmed, args.resourceType);
        if (installed.length > 0) {
          return yield* resolveFromCandidates(trimmed, args.resourceType, "installed", installed);
        }
        const registry = yield* registryCandidates(
          trimmed,
          args.resourceType,
          args.registrySourceName,
        );
        return yield* resolveFromCandidates(trimmed, args.resourceType, "registry", registry);
      }
    }
  });

export const resolveInstalledIdentifier = (args: {
  readonly input: string;
  readonly resourceType: IdentifierResourceType;
}) =>
  Effect.gen(function* () {
    const trimmed = args.input.trim();
    const parsed = parseExtensionFqnParts(trimmed);
    if (parsed !== undefined) {
      if (!isIdentifierResourceType(parsed.type) || parsed.type !== args.resourceType) {
        return yield* makeAppError({
          code: "not_found",
          detail: `"${trimmed}" is not a ${args.resourceType} identifier`,
          suggestions: [
            {
              description: `Use a ${args.resourceType} identifier like @owner/${toExtensionTypePlural(args.resourceType)}/name.`,
            },
          ],
        });
      }
    }

    const candidates = yield* installedCandidates(trimmed, args.resourceType);
    return yield* resolveFromCandidates(trimmed, args.resourceType, "installed", candidates);
  });

export const resolveInstalledIdentifierNameOrInput = (args: {
  readonly input: string;
  readonly resourceType: IdentifierResourceType;
}) =>
  Effect.gen(function* () {
    const trimmed = args.input.trim();
    const result = yield* Effect.result(resolveInstalledIdentifier(args));
    if (Result.isFailure(result)) {
      if (result.failure.code === "not_found") return trimmed;
      return yield* result.failure;
    }
    return Option.getOrElse(result.success.installedName, () => result.success.name);
  });
