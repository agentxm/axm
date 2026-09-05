import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  installableExtensionTypes,
  installableExtensionTypePluralSegments,
  InstallableExtensionTypePluralSchema,
  InstallableExtensionTypeSchema,
  isInstallableExtensionType,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  toInstallableExtensionTypePlural,
} from "./installable-types.js";

describe("installable extension types", () => {
  it("defines the supported installable singular types", () => {
    expect(installableExtensionTypes).toEqual([
      "skill",
      "mcp-server",
      "subagent",
      "rule",
      "hook",
      "knowledge",
      "pack",
    ]);
  });

  it("defines the supported installable plural segments", () => {
    expect(installableExtensionTypePluralSegments).toEqual([
      "skills",
      "mcps",
      "subagents",
      "rules",
      "hooks",
      "knowledge",
      "packs",
    ]);
  });

  it("guards installable singular types", () => {
    expect(isInstallableExtensionType("skill")).toBe(true);
    expect(isInstallableExtensionType("mcp-server")).toBe(true);
    expect(isInstallableExtensionType("command")).toBe(false);
    expect(isInstallableExtensionType("rule")).toBe(true);
    expect(isInstallableExtensionType("hook")).toBe(true);
    expect(isInstallableExtensionType("knowledge")).toBe(true);
  });

  it("guards installable plural segments", () => {
    expect(isInstallableExtensionTypePlural("skills")).toBe(true);
    expect(isInstallableExtensionTypePlural("mcps")).toBe(true);
    expect(isInstallableExtensionTypePlural("commands")).toBe(false);
    expect(isInstallableExtensionTypePlural("rules")).toBe(true);
    expect(isInstallableExtensionTypePlural("hooks")).toBe(true);
    expect(isInstallableExtensionTypePlural("knowledge")).toBe(true);
    expect(isInstallableExtensionTypePlural(undefined)).toBe(false);
  });

  it("maps between singular and plural installable types", () => {
    expect(toInstallableExtensionType("skills")).toBe("skill");
    expect(toInstallableExtensionType("packs")).toBe("pack");
    expect(toInstallableExtensionType("rules")).toBe("rule");
    expect(toInstallableExtensionType("hooks")).toBe("hook");
    expect(toInstallableExtensionType("knowledge")).toBe("knowledge");
    expect(toInstallableExtensionTypePlural("subagent")).toBe("subagents");
    expect(toInstallableExtensionTypePlural("rule")).toBe("rules");
    expect(toInstallableExtensionTypePlural("hook")).toBe("hooks");
    expect(toInstallableExtensionTypePlural("knowledge")).toBe("knowledge");
  });

  it("exposes installable type schemas", () => {
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("skill")),
    ).toBe(true);
    expect(
      Result.isFailure(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("command")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("hook")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("knowledge")),
    ).toBe(true);
    expect(
      Result.isFailure(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("file")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("mcps")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("rules")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("hooks")),
    ).toBe(true);
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("knowledge"),
      ),
    ).toBe(true);
  });
});
