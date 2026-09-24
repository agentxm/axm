import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { captureHelpText } from "../../test-support/command-tree-test-helpers.js";

describe("root update command help", () => {
  it.effect("documents the no-arg and FQN update contract", () =>
    Effect.gen(function* () {
      const output = yield* captureHelpText(["update"]);

      expect(output).toContain(
        "Advance accepted resolutions within each source's selection intent",
      );
      expect(output).toContain("[<extension[@version]>]");
      expect(output).toContain("Installed extension FQN; optional @version");
      expect(output).toContain("constrains Registry sources only");
      expect(output).toContain("axm update");
      expect(output).toContain("axm update @acme/skills/code-review");
      expect(output).toContain("regardless of source family");
      expect(output).toContain("--ignore-release-age");
    }),
  );
});
