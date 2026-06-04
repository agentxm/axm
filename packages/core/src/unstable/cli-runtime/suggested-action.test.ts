import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { SuggestedActionSchema } from "./suggested-action.js";

describe("SuggestedActionSchema", () => {
  it("requires cmd when description mentions an axm command", () => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(() => decode({ description: "Run `axm skills list`" })).toThrow();
    expect(decode({ description: "Run `axm skills list`", cmd: "axm skills list" })).toEqual({
      description: "Run `axm skills list`",
      cmd: "axm skills list",
    });
  });

  it("rejects axm commands with shell grouping metacharacters", () => {
    const decode = Schema.decodeUnknownSync(SuggestedActionSchema);

    expect(() =>
      decode({
        description: "Undo",
        cmd: "axm skills uninstall cpp-conan-tinyflags-add-flag (pkg:conan/agentxm-example-tinyflags)",
      }),
    ).toThrow();
  });
});
