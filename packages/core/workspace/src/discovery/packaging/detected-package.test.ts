import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { makeDetectedPackage } from "./detected-package.js";

const pubType = Schema.decodeUnknownSync(PackageTypeSchema)("pub");
const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");

describe("makeDetectedPackage", () => {
  it("drops empty and whitespace-only package names", () => {
    expect(Option.isNone(makeDetectedPackage({ type: pubType, name: "", source: "test" }))).toBe(
      true,
    );
    expect(Option.isNone(makeDetectedPackage({ type: pubType, name: "   ", source: "test" }))).toBe(
      true,
    );
  });

  it("drops a name rejected by the purl constructor", () => {
    const detected = makeDetectedPackage({ type: pubType, name: "bad.name", source: "test" });
    expect(Option.isNone(detected)).toBe(true);
  });

  it("preserves qualifiers and subpath in decoded package parts", () => {
    const detected = makeDetectedPackage({
      type: condaType,
      name: "numpy",
      version: "1.24.0",
      qualifiers: { channel: "conda-forge" },
      subpath: "extras/feature",
      source: "test",
    });
    expect(Option.isSome(detected)).toBe(true);
    if (Option.isSome(detected)) {
      expect(detected.value.purl.qualifiers).toEqual({ channel: "conda-forge" });
      expect(detected.value.purl.subpath).toBe("extras/feature");
    }
  });
});
