import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  SuggestedActionSchema,
  isSafeSuggestedAxmCommand,
  sanitizeSuggestedAction,
} from "./suggested-action.js";

describe("SuggestedActionSchema", () => {
  it("allows description-only remediation even when it names AXM", () => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(decode({ description: "Run `axm skills list`" })).toEqual({
      description: "Run `axm skills list`",
    });
    expect(decode({ description: "Run `axm skills list`", cmd: "axm skills list" })).toEqual({
      description: "Run `axm skills list`",
      cmd: "axm skills list",
    });
  });

  it("accepts one ordinary AXM invocation", () => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(
      decode({
        description: "Replace the pack dependency",
        cmd: "axm packs add workflow @acme/skills/review --replace-existing",
      }),
    ).toEqual({
      description: "Replace the pack dependency",
      cmd: "axm packs add workflow @acme/skills/review --replace-existing",
    });
  });

  it.each([
    "npm install axm",
    "axm lint\nrm -rf elsewhere",
    "axm lint; echo unsafe",
    "axm lint | tee findings",
    "axm lint && echo unsafe",
    "axm lint & echo unsafe",
    "axm lint > result.txt",
    "axm lint < input.txt",
    "axm lint `echo unsafe`",
    "axm lint $(echo unsafe)",
    "axm lint (echo unsafe)",
    "axm lint ${UNTRUSTED}",
  ])("rejects composed or non-AXM command %s", (command) => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(() =>
      decode({
        description: "Follow up",
        cmd: command,
      }),
    ).toThrow();
    expect(isSafeSuggestedAxmCommand(command)).toBe(false);
  });

  it("removes only an unsafe command at an untrusted boundary", () => {
    expect(
      sanitizeSuggestedAction({
        description: "Review this finding",
        cmd: "axm lint; echo unsafe",
        url: "https://axm.sh/docs/lint",
      }),
    ).toEqual({
      description: "Review this finding",
      url: "https://axm.sh/docs/lint",
    });
  });
});
