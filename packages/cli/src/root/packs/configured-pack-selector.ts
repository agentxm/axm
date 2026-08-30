import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  parseRegistrySourcePatternParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-management/unstable/sources";
import type { ConfiguredRecordRow } from "@agentxm/extension-management/unstable/workspace";

export interface ConfiguredPackSelection {
  readonly configuredName: string;
  readonly entry: ConfiguredRecordRow;
  readonly match: "local-name" | "fqn";
}

interface ResolveConfiguredPackSelectorArgs {
  readonly configured: ReadonlyArray<ConfiguredRecordRow>;
  readonly configuredOwner?: string;
  readonly selector: string;
  readonly recovery?: {
    readonly command: "add" | "remove";
    readonly extension: string;
  };
}

const configuredPackFqn = (
  entry: ConfiguredRecordRow,
  configuredOwner?: string,
): string | undefined => {
  if (entry.source === undefined) return undefined;
  if (entry.source === "registry") {
    return configuredOwner === undefined ? undefined : `${configuredOwner}/packs/${entry.name}`;
  }

  if (isWorkspaceSourceLocator(entry.source)) {
    return configuredOwner === undefined ? undefined : `${configuredOwner}/packs/${entry.name}`;
  }

  const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
  return parsed?.type === "packs" && parsed.name !== undefined
    ? `${parsed.owner}/packs/${parsed.name}`
    : undefined;
};

export const resolveConfiguredPackSelector = (
  args: ResolveConfiguredPackSelectorArgs,
): Effect.Effect<ConfiguredPackSelection, AppError> => {
  const local = args.configured.find((entry) => entry.name === args.selector);
  if (local !== undefined) {
    return Effect.succeed({
      configuredName: local.name,
      entry: local,
      match: "local-name",
    });
  }

  const parsed = parseRegistrySourcePatternParts(args.selector);
  if (parsed?.type !== undefined && parsed.type !== "packs") {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Pack selector '${args.selector}' does not identify a pack`,
      }),
    );
  }
  if (parsed?.type !== "packs" || parsed.name === undefined || parsed.versionRange !== undefined) {
    return Effect.fail(
      makeAppError({
        code: "not_found",
        detail: `Pack '${args.selector}' not found; it is not configured in this workspace`,
      }),
    );
  }

  const fqn = `${parsed.owner}/packs/${parsed.name}`;
  const matches = args.configured.filter(
    (entry) => configuredPackFqn(entry, args.configuredOwner) === fqn,
  );
  if (matches.length === 0) {
    return Effect.fail(
      makeAppError({
        code: "not_found",
        detail: `Pack '${args.selector}' not found; it is not configured in this workspace`,
      }),
    );
  }
  if (matches.length > 1) {
    return Effect.fail(
      makeAppError({
        code: "conflict",
        detail: `Pack selector '${args.selector}' matches multiple configured packs`,
        suggestions: matches
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({
            description: `Use configured pack name ${name}`,
            ...(args.recovery === undefined
              ? {}
              : {
                  cmd: `axm packs ${args.recovery.command} ${name} ${args.recovery.extension}`,
                }),
          })),
      }),
    );
  }

  const selected = matches[0];
  if (selected === undefined) {
    return Effect.fail(
      makeAppError({
        code: "internal",
        detail: `Configured pack selector '${args.selector}' resolved without a selected row`,
      }),
    );
  }
  return Effect.succeed({
    configuredName: selected.name,
    entry: selected,
    match: "fqn",
  });
};
