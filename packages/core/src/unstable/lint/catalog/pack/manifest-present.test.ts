/**
 * Unit tests for `pack/manifest-present`.
 *
 * Unlike the skill analog, there is no non-native early-return arm — packs are
 * registry-only at v1.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PackFileAccessor, PackRuleContext } from "../../context.js";
import { manifestPresentRule } from "./manifest-present.js";

const makeAccessor = (manifestPresent: boolean): PackFileAccessor => ({
  exists: (path) => Effect.succeed(path === "extension-pack.json" && manifestPresent),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
});

const makeContext = (manifestPresent: boolean): PackRuleContext => ({
  subject: { packJson: undefined },
  files: makeAccessor(manifestPresent),
  displayRoot: "",
});

describe("pack/manifest-present", () => {
  it.effect("produces zero findings when extension-pack.json is present", () =>
    Effect.gen(function* () {
      const findings = yield* manifestPresentRule.check(makeContext(true));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces one error finding when extension-pack.json is absent", () =>
    Effect.gen(function* () {
      const findings = yield* manifestPresentRule.check(makeContext(false));
      expect(findings).toHaveLength(1);
      const [finding] = findings;
      expect(finding?.ruleId).toBe("pack/manifest-present");
      expect(finding?.severity).toBe("error");
      expect(finding?.location).toEqual({ file: "extension-pack.json" });
    }),
  );
});
