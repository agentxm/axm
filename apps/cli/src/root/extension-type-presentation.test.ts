import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { captureHelpDoc } from "../test-support/command-tree-test-helpers.js";
import { EXTENSION_TYPE_PRESENTATION } from "./extension-type-presentation.js";

describe("extension type presentation", () => {
  it.effect("agrees with the extension catalog and root install flags", () =>
    Effect.gen(function* () {
      const installHelp = yield* captureHelpDoc(["install"]);
      const registeredFlags = new Set(installHelp.flags.map((flag) => flag.name));
      const selectorFlags = installableExtensionTypes.map(
        (type) => EXTENSION_TYPE_PRESENTATION[type].selectorFlag,
      );

      expect(new Set(selectorFlags).size).toBe(installableExtensionTypes.length);
      for (const type of installableExtensionTypes) {
        const presentation = EXTENSION_TYPE_PRESENTATION[type];
        expect(presentation.route).toBe(extensionTypeToPlural[type]);
        expect(presentation.inspect.cmd).toBe(`axm ${presentation.route} list`);
        expect(registeredFlags.has(presentation.selectorFlag)).toBe(true);
      }
    }),
  );
});
