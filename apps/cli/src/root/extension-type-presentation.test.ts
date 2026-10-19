import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { captureHelpDoc } from "../test-support/command-tree-test-helpers.js";
import { extensionTypePresentation } from "./extension-type-presentation.js";

describe("extension type presentation", () => {
  it.effect("names a selector flag root install registers for every type", () =>
    Effect.gen(function* () {
      const installHelp = yield* captureHelpDoc(["install"]);
      const registeredFlags = new Set(installHelp.flags.map((flag) => flag.name));

      for (const type of installableExtensionTypes) {
        expect(registeredFlags.has(extensionTypePresentation(type).selectorFlag)).toBe(true);
      }
    }),
  );
});
