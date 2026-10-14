import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { SettingsSchema, type Settings } from "../desired/settings/index.js";
import {
  defaultRegistrySelection,
  selectRegistry,
  type SourceConfigurationSnapshot,
} from "./registry-selection.js";

const settings = (value: unknown): Settings => Schema.decodeUnknownSync(SettingsSchema)(value);

const snapshot = (project: unknown = {}, user: unknown = {}): SourceConfigurationSnapshot => ({
  project: { path: "/project/axm.json", settings: settings(project) },
  user: { path: "/home/.axm/workspace/axm.json", settings: settings(user) },
  builtInSources: [
    {
      name: "agentxm",
      type: "registry",
      location: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
    },
  ],
});

const corp = { name: "corp", type: "registry", location: "https://registry.corp.test/" };

const selected = (value: SourceConfigurationSnapshot, selector?: string) =>
  Result.map(selectRegistry(value, Option.fromUndefinedOr(selector)), (bound) => ({
    name: bound.name,
    href: bound.endpoint.href,
    reason: bound.reason,
    settingsPath: Option.getOrUndefined(bound.settingsPath),
  }));

describe("selectRegistry", () => {
  it("prefers the project default, then the user default, then the built-in", () => {
    expect(defaultRegistrySelection({}, {})).toEqual({ name: "agentxm", scope: "built-in" });
    expect(defaultRegistrySelection({}, { defaultRegistry: "corp" })).toEqual({
      name: "corp",
      scope: "user",
    });
    expect(
      defaultRegistrySelection({ defaultRegistry: "project" }, { defaultRegistry: "corp" }),
    ).toEqual({ name: "project", scope: "project" });
  });

  it("binds the default to its configured endpoint and the settings that chose it", () => {
    expect(selected(snapshot({ defaultRegistry: "corp", sources: [corp] }))).toEqual(
      Result.succeed({
        name: "corp",
        href: "https://registry.corp.test",
        reason: "project-default",
        settingsPath: "/project/axm.json",
      }),
    );
    expect(selected(snapshot({}, { defaultRegistry: "corp", sources: [corp] }))).toEqual(
      Result.succeed({
        name: "corp",
        href: "https://registry.corp.test",
        reason: "user-default",
        settingsPath: "/home/.axm/workspace/axm.json",
      }),
    );
  });

  it("names a source from either settings layer, the project's first, and keeps the built-in reserved", () => {
    expect(selected(snapshot({ defaultRegistry: "corp" }, { sources: [corp] }))).toMatchObject(
      Result.succeed({ href: "https://registry.corp.test" }),
    );
    expect(selected(snapshot({}, {}), "agentxm")).toMatchObject(
      Result.succeed({ href: "https://registry.agentxm.ai", reason: "named-source" }),
    );
    expect(
      selected(
        snapshot(
          { sources: [{ ...corp, location: "https://project.corp.test" }] },
          { sources: [corp] },
        ),
        "corp",
      ),
    ).toEqual(
      Result.succeed({
        name: "corp",
        href: "https://project.corp.test",
        reason: "named-source",
        settingsPath: "/project/axm.json",
      }),
    );
    expect(selected(snapshot({}, { sources: [corp] }), "corp")).toMatchObject(
      Result.succeed({ settingsPath: "/home/.axm/workspace/axm.json" }),
    );
  });

  it("selects an explicit http(s) origin, and refuses a file URL or a path", () => {
    expect(selected(snapshot(), "https://registry.other.test/")).toMatchObject(
      Result.succeed({ name: "https://registry.other.test", reason: "explicit-url" }),
    );
    for (const selector of ["file:///srv/registry", "https://registry.other.test/axm"]) {
      const result = selectRegistry(snapshot(), Option.some(selector));
      expect(Result.isFailure(result) ? result.failure._tag : undefined).toBe(
        "RegistrySelectionFailed",
      );
    }
  });

  it("reports an unknown default or name with its scope, never another Registry", () => {
    const unknownDefault = selectRegistry(snapshot({ defaultRegistry: "corp" }), Option.none());
    expect(Result.isFailure(unknownDefault) ? unknownDefault.failure : undefined).toMatchObject({
      _tag: "RegistrySourceUnknown",
      name: "corp",
      scope: "project",
      settingsPath: Option.some("/project/axm.json"),
    });
    const unknownName = selectRegistry(snapshot(), Option.some("corp"));
    expect(Result.isFailure(unknownName) ? unknownName.failure : undefined).toMatchObject({
      _tag: "RegistrySourceUnknown",
      name: "corp",
      scope: "explicit",
    });
    // An explicit selection is refused while the default cannot be selected.
    const explicit = selectRegistry(
      snapshot({ defaultRegistry: "missing", sources: [corp] }),
      Option.some("corp"),
    );
    expect(Result.isFailure(explicit) ? explicit.failure._tag : undefined).toBe(
      "RegistrySourceUnknown",
    );
  });

  it("reports a built-in default this installation does not configure as the built-in's", () => {
    const missingBuiltIn = selectRegistry(
      { ...snapshot({}, { sources: [corp] }), builtInSources: [] },
      Option.none(),
    );
    expect(Result.isFailure(missingBuiltIn) ? missingBuiltIn.failure : undefined).toMatchObject({
      _tag: "RegistrySourceUnknown",
      name: "agentxm",
      scope: "built-in",
      settingsPath: Option.none(),
    });
  });
});
