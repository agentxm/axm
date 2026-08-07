import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  MACHINE_OUTPUT_CONTRACT_ID,
  MachineOutputDocumentSchema,
  detectMachineOutputDocumentKind,
} from "./machine-output-document.js";

const kindOf = (input: unknown): string | undefined =>
  Option.getOrUndefined(detectMachineOutputDocumentKind(input));

describe("machine-output document contract", () => {
  it("publishes a stable contract identifier", () => {
    expect(MACHINE_OUTPUT_CONTRACT_ID).toBe("axm.machine-output/result-envelope-v1");
  });

  it.each([
    [{ ok: true, result: { items: [] } }, "result-envelope-v1"],
    [{ ok: false, result: { outcome: "failed" } }, "result-envelope-v1"],
    [
      { ok: false, code: "usage", title: "Usage Error", detail: "Invalid arguments" },
      "error-envelope-v1",
    ],
    [{ type: "help", description: "Help", usage: "axm", flags: [] }, "help-document-v1"],
    [{ type: "version", name: "axm", version: "0.24.3" }, "version-document-v1"],
  ])("structurally detects %#", (document, expected) => {
    expect(kindOf(document)).toBe(expected);
    expect(() => Schema.decodeUnknownSync(MachineOutputDocumentSchema)(document)).not.toThrow();
  });

  it.each([
    { ok: true, items: [] },
    { ok: false, outcome: "failed" },
    { type: "help", usage: "axm" },
    { type: "version", name: "axm" },
    "not-json",
  ])("rejects malformed and legacy flat documents %#", (document) => {
    expect(kindOf(document)).toBeUndefined();
    expect(() => Schema.decodeUnknownSync(MachineOutputDocumentSchema)(document)).toThrow();
  });
});
