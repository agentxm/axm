import { describe, expect, it } from "vitest";
import * as JsonPatch from "effect/JsonPatch";
import { applyJsonPatchToText, jsonPointerToJsonPath } from "./format-preserving-json.js";

describe("jsonPointerToJsonPath", () => {
  it("unescapes object-key tokens", () => {
    const result = jsonPointerToJsonPath("/a~1b/c~0d", {
      "a/b": { "c~d": 1 },
    });

    expect(result).toEqual({ _tag: "Success", path: ["a/b", "c~d"] });
  });

  it("keeps numeric object keys as strings", () => {
    const result = jsonPointerToJsonPath("/items/0/value", {
      items: { "0": { value: 1 } },
    });

    expect(result).toEqual({ _tag: "Success", path: ["items", "0", "value"] });
  });

  it("translates array positions to numbers", () => {
    const result = jsonPointerToJsonPath("/items/0/value", {
      items: [{ value: 1 }],
    });

    expect(result).toEqual({ _tag: "Success", path: ["items", 0, "value"] });
  });

  it("translates the root pointer to an empty path", () => {
    expect(jsonPointerToJsonPath("", [])).toEqual({ _tag: "Success", path: [] });
  });

  it("returns a typed failure for an invalid pointer", () => {
    expect(jsonPointerToJsonPath("items/0", { items: [1] })).toEqual({
      _tag: "Failure",
      reason: "invalid_pointer",
    });
  });
});

describe("applyJsonPatchToText", () => {
  it("applies escaped object-key paths", () => {
    const prior = { "a/b": { "c~d": 1 } };
    const target = { "a/b": { "c~d": 2 } };
    const result = applyJsonPatchToText(
      `{
  "a/b": {
    "c~d": 1
  }
}`,
      prior,
      JsonPatch.get(prior, target),
    );

    if (result._tag === "Failure") throw new Error(result.reason);
    expect(result.text).toBe(`{
  "a/b": {
    "c~d": 2
  }
}`);
  });

  it("applies a multi-operation array patch sequentially", () => {
    const prior = { agents: ["claude-code", "codex", "cursor"] };
    const target = { agents: ["claude-code", "cursor"] };
    const result = applyJsonPatchToText(
      `{
  "agents": [
    "claude-code",
    "codex",
    "cursor"
  ]
}`,
      prior,
      JsonPatch.get(prior, target),
    );

    if (result._tag === "Failure") throw new Error(result.reason);
    expect(result.text).toBe(`{
  "agents": [
    "claude-code",
    "cursor"
  ]
}`);
  });

  it("passes the translated path to the insertion-index policy", () => {
    const prior = { agents: ["claude-code"], futureKey: true };
    const target = { agents: ["claude-code"], lint: {}, futureKey: true };
    const result = applyJsonPatchToText(
      `{
  "agents": [
    "claude-code"
  ],
  "futureKey": true
}`,
      prior,
      JsonPatch.get(prior, target),
      {
        getInsertionIndex: (path, properties) =>
          path.length === 1 && path[0] === "lint" ? properties.indexOf("futureKey") : -1,
      },
    );

    if (result._tag === "Failure") throw new Error(result.reason);
    expect(result.text).toBe(`{
  "agents": [
    "claude-code"
  ],
  "lint": {},
  "futureKey": true
}`);
  });

  it("replaces the root document", () => {
    const prior = [1, 2];
    const target = { value: true };
    const result = applyJsonPatchToText(
      `[
  1,
  2
]`,
      prior,
      JsonPatch.get(prior, target),
    );

    if (result._tag === "Failure") throw new Error(result.reason);
    expect(result.text).toBe(`{
  "value": true
}`);
  });
});
