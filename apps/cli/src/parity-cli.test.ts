/**
 * CLI-tier extension-type parity.
 *
 * Every catalog extension type resolves a prose help topic and exposes the
 * same lifecycle command surface. Catalog-driven cases make a new type answer
 * for each surface without a per-type edit here.
 */

import * as Effect from "effect/Effect";

import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import {
  extensionTypes,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { describe, expect, it } from "@effect/vitest";

import { HELP_TOPIC_NAMES } from "./__generated__/help-topics.js";
import { collectHelpFiles } from "./test-support/command-tree-test-helpers.js";

/** Mutation verbs every registry-distributed extension type exposes. */
const LIFECYCLE_MUTATION_VERBS = ["install", "update", "enable", "disable", "uninstall"] as const;

const lifecycleCommands = (types: ReadonlyArray<ExtensionType>): ReadonlyArray<string> =>
  types.flatMap((type) =>
    LIFECYCLE_MUTATION_VERBS.map((verb) => `axm ${toExtensionTypePlural(type)} ${verb}`),
  );

describe("extension type parity (cli tier)", () => {
  it("resolves a prose help topic for every catalog extension type", () => {
    const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);
    expect(
      CATALOG_EXTENSION_TYPES.filter((type) => !topicNames.has(toExtensionTypePlural(type))),
    ).toStrictEqual([]);
  });

  it.effect("registers lifecycle verbs for every extension type, including containers", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(
        lifecycleCommands(extensionTypes).filter((command) => !files.has(command)),
      ).toStrictEqual([]);
    }),
  );

  it.effect("exposes preview and the scope selector on every catalog lifecycle mutation", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(
        lifecycleCommands(CATALOG_EXTENSION_TYPES).filter((command) => {
          const flags = files.get(command)?.flags.map((flag) => flag.name) ?? [];
          return !flags.includes("preview") || !flags.includes("scope");
        }),
      ).toStrictEqual([]);
    }),
  );
});
