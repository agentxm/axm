import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { CommandExtensionRef } from "../../commands/index.js";
import { parseRegistrySourcePatternParts, parseRegistrySourceRef } from "../../extensions/index.js";
import type { FilesExtensionRef } from "../../files/index.js";
import type { HookExtensionRef } from "../../hooks/index.js";
import type { McpServerExtensionRef } from "../../mcps/index.js";
import type { PackRef } from "../../packs/index.js";
import { parseMinimumReleaseAge, type ReleaseAgePolicy } from "../../registry/index.js";
import type { RuleExtensionRef } from "../../rules/index.js";
import { resolveSource, SourceHostProviders } from "../../source-resolution/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import type { SubagentExtensionRef } from "../../subagents/index.js";
import type { VersionRange } from "../../version-constraints/version-constraints.js";
import { WorkspaceMutations } from "../service-interface.js";

const configuredReleaseAgePolicy = (): Effect.Effect<
  Option.Option<ReleaseAgePolicy>,
  AppError,
  WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
    const minimumAgeMs = parseMinimumReleaseAge(minimumReleaseAge);
    if (Option.isNone(minimumAgeMs)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }
    return Option.some({ minimumAgeMs: minimumAgeMs.value, now: new Date() });
  });

export const resolveConfiguredSkill = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid skill source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseRegistrySourcePatternParts(source);
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "skill",
        owner: requestedOwner,
        versionRange,
        releaseAgePolicy,
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
            description: `Verify the configured source still contains the skill or update settings.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredSubagent = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid subagent source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseRegistrySourcePatternParts(source);
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "subagent",
        owner: requestedOwner,
        versionRange,
        releaseAgePolicy,
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
            description: `Verify the configured source still contains the subagent or update settings.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredCommand = (name: string, source: string) =>
  Effect.gen(function* () {
    const parsed = parseRegistrySourceRef(source);

    if (parsed === undefined || parsed.type !== "commands" || parsed.name !== name) {
      return yield* makeAppError({
        code: "validation",
        detail: `The configured command entry "${name}" is invalid.`,
        suggestions: [{ description: `Use a name like "@owner/commands/name".` }],
      });
    }

    const providers = yield* SourceHostProviders;
    const versionRange = Option.fromUndefinedOr(parsed.versionRange);
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid command source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "command",
        owner: Option.some(parsed.owner),
        versionRange,
        releaseAgePolicy,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is CommandExtensionRef => entry.type === "command"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured command "${name}"`,
            suggestions: [
              {
                description: `Verify the configured registry source is reachable and still contains the command.`,
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.command.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured command "${name}" could not be found in its source`,
        suggestions: [
          {
            description: `Verify the configured source still contains the command or update settings.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange,
    };
  });

export const resolveConfiguredFiles = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid context source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseRegistrySourcePatternParts(source);
    const requestedOwner =
      parsedPattern?.type === "files"
        ? Option.some(parsedPattern.owner)
        : resolvedSource.type === "registry"
          ? resolvedSource.owner
          : Option.none();
    const versionRange =
      resolvedSource.type === "registry" && parsedPattern?.type === "files"
        ? Option.fromUndefinedOr(parsedPattern.versionRange)
        : Option.none<VersionRange>();
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "files",
        owner: requestedOwner,
        versionRange,
        releaseAgePolicy,
      })
      .pipe(
        Effect.map((entries) =>
          entries.filter((entry): entry is FilesExtensionRef => entry.type === "files"),
        ),
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: `Failed to resolve configured Context Files package "${name}"`,
            suggestions: [
              {
                description:
                  "Verify the configured source is reachable and still contains the Context Files package.",
              },
            ],
            cause,
          }),
        ),
      );

    const ref = refs.find((entry) => entry.file.name === name);
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Configured Context Files package "${name}" could not be found in its source`,
        suggestions: [
          {
            description:
              "Verify the configured source still contains the Context Files package or update settings.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredRule = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid rule source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseRegistrySourcePatternParts(source);
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "rule",
        owner: requestedOwner,
        versionRange,
        releaseAgePolicy,
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
            description:
              "Verify the configured source still contains the rule or update settings.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredHook = (name: string, source: string) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid hook source for ${name}: ${cause.message}`,
          cause,
        }),
      ),
    );

    const parsedPattern = parseRegistrySourcePatternParts(source);
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();

    const refs = yield* providers
      .find(resolvedSource, {
        names: [name],
        type: "hook",
        owner: requestedOwner,
        versionRange,
        releaseAgePolicy,
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
            description:
              "Verify the configured source still contains the hook or update settings.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange: ref.refType === "registry" ? versionRange : Option.none(),
    };
  });

export const resolveConfiguredMcpServer = (name: string, source: string) =>
  Effect.gen(function* () {
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid MCP server source for ${name}: ${cause.message}`,
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
        releaseAgePolicy,
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
            description: `Verify the configured source still contains the MCP server or update settings.json.`,
          },
        ],
      });
    }

    return {
      ref,
      versionRange,
    };
  });

export const resolveConfiguredPack = (name: string, source: string) =>
  Effect.gen(function* () {
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
    const releaseAgePolicy = yield* configuredReleaseAgePolicy();
    const resolvedSource = yield* resolveSource(source).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid pack source for ${name}: ${cause.message}`,
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
        releaseAgePolicy,
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
            description:
              "Verify the configured source still contains the pack or update settings.json.",
          },
        ],
      });
    }

    return {
      ref,
      versionRange,
    };
  });
