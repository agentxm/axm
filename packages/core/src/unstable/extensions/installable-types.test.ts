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
      "command",
      "mcp-server",
      "subagent",
      "file",
      "pack",
    ]);
  });

  it("defines the supported installable plural segments", () => {
    expect(installableExtensionTypePluralSegments).toEqual([
      "skills",
      "commands",
      "mcp-servers",
      "subagents",
      "files",
      "packs",
    ]);
  });

  it("guards installable singular types", () => {
    expect(isInstallableExtensionType("skill")).toBe(true);
    expect(isInstallableExtensionType("mcp-server")).toBe(true);
    expect(isInstallableExtensionType("file")).toBe(true);
    expect(isInstallableExtensionType("rule")).toBe(false);
  });

  it("guards installable plural segments", () => {
    expect(isInstallableExtensionTypePlural("skills")).toBe(true);
    expect(isInstallableExtensionTypePlural("mcp-servers")).toBe(true);
    expect(isInstallableExtensionTypePlural("files")).toBe(true);
    expect(isInstallableExtensionTypePlural("rules")).toBe(false);
    expect(isInstallableExtensionTypePlural(undefined)).toBe(false);
  });

  it("maps between singular and plural installable types", () => {
    expect(toInstallableExtensionType("skills")).toBe("skill");
    expect(toInstallableExtensionType("packs")).toBe("pack");
    expect(toInstallableExtensionType("files")).toBe("file");
    expect(toInstallableExtensionTypePlural("command")).toBe("commands");
    expect(toInstallableExtensionTypePlural("subagent")).toBe("subagents");
    expect(toInstallableExtensionTypePlural("file")).toBe("files");
  });

  it("exposes installable type schemas", () => {
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("skill")),
    ).toBe(true);
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(InstallableExtensionTypeSchema)("file")),
    ).toBe(true);
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("mcp-servers"),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(Schema.decodeUnknownResult(InstallableExtensionTypePluralSchema)("rules")),
    ).toBe(true);
  });
});
