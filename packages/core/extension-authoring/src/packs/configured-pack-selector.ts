/**
 * Which configured pack a selector names.
 *
 * A person edits a pack by the name their workspace configured it under, or
 * by its owner-qualified identity. The local name wins when both could match,
 * because that is the name the workspace itself uses.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import {
  parseRegistrySourcePatternParts,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { ConfiguredRecordRow } from "@agentxm/workspace-state";

import {
  PackNotConfigured,
  PackSelectorAmbiguous,
  PackSelectorNotAPack,
} from "./membership-errors.js";

export interface ConfiguredPackSelection {
  readonly configuredName: string;
  readonly entry: ConfiguredRecordRow;
  readonly match: "local-name" | "fqn";
}

export interface ResolveConfiguredPackSelectorArgs {
  readonly configured: ReadonlyArray<ConfiguredRecordRow>;
  readonly configuredOwner?: string;
  readonly selector: string;
}

const configuredPackFqn = (
  entry: ConfiguredRecordRow,
  configuredOwner?: string,
): string | undefined => {
  if (entry.source === undefined) return undefined;
  if (entry.source === "registry" || isWorkspaceSourceLocator(entry.source)) {
    return configuredOwner === undefined ? undefined : `${configuredOwner}/packs/${entry.name}`;
  }

  const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
  return parsed?.type === "packs" && parsed.name !== undefined
    ? `${parsed.owner}/packs/${parsed.name}`
    : undefined;
};

export const resolveConfiguredPackSelector = (
  args: ResolveConfiguredPackSelectorArgs,
): Effect.Effect<
  ConfiguredPackSelection,
  PackSelectorNotAPack | PackNotConfigured | PackSelectorAmbiguous
> => {
  const local = args.configured.find((entry) => entry.name === args.selector);
  if (local !== undefined) {
    return Effect.succeed({ configuredName: local.name, entry: local, match: "local-name" });
  }

  const parsed = parseRegistrySourcePatternParts(args.selector);
  if (parsed?.type !== undefined && parsed.type !== "packs") {
    return Effect.fail(new PackSelectorNotAPack({ selector: args.selector }));
  }
  if (parsed?.type !== "packs" || parsed.name === undefined || parsed.versionRange !== undefined) {
    return Effect.fail(new PackNotConfigured({ selector: args.selector }));
  }

  const fqn = `${parsed.owner}/packs/${parsed.name}`;
  const matches = args.configured.filter(
    (entry) => configuredPackFqn(entry, args.configuredOwner) === fqn,
  );
  const [selected, ...rest] = matches;
  if (selected === undefined) {
    return Effect.fail(new PackNotConfigured({ selector: args.selector }));
  }
  if (rest.length > 0) {
    return Effect.fail(
      new PackSelectorAmbiguous({
        selector: args.selector,
        configuredNames: matches
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right)),
      }),
    );
  }
  return Effect.succeed({ configuredName: selected.name, entry: selected, match: "fqn" });
};
