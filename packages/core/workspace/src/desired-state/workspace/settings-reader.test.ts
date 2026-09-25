import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { createDefaultSettings, type SourceHostConfig } from "../settings/index.js";
import { registryBaseUrl, SettingsReader } from "./settings-reader.js";
import { WorkspaceReadTest } from "./test-stubs.js";

const sources: ReadonlyArray<SourceHostConfig> = [
  { name: "company", type: "registry", location: new URL("https://registry.company.test/axm/") },
  { name: "origin", type: "registry", location: new URL("https://registry.origin.test") },
  { name: "local", type: "registry", location: new URL("file:///tmp/my%20registry/") },
];

const target = (name: Option.Option<string>, defaultRegistry?: string) =>
  Effect.flatMap(SettingsReader, (settings) => settings.registryTarget(name)).pipe(
    Effect.provide(
      WorkspaceReadTest({
        baseDir: "/workspace",
        settings: {
          ...createDefaultSettings(),
          sources: [...sources],
          ...(defaultRegistry === undefined ? {} : { defaultRegistry }),
        },
      }),
    ),
  );

describe("registryBaseUrl", () => {
  it.each([
    ["https://registry.origin.test", "https://registry.origin.test"],
    ["https://registry.origin.test/", "https://registry.origin.test"],
    ["https://registry.company.test/axm", "https://registry.company.test/axm"],
    ["https://registry.company.test/axm/", "https://registry.company.test/axm"],
    ["file:///tmp/my%20registry", "file:///tmp/my%20registry"],
    ["file:///tmp/my%20registry/", "file:///tmp/my%20registry"],
  ])("renders %s as %s", (configured, rendered) => {
    expect(registryBaseUrl(new URL(configured))).toBe(rendered);
  });
});

describe("SettingsReader.registryTarget", () => {
  it.effect("renders the named registry source through the one base-URL rule", () =>
    Effect.gen(function* () {
      expect(yield* target(Option.some("company"))).toEqual({
        name: "company",
        url: Option.some("https://registry.company.test/axm"),
      });
      expect(yield* target(Option.some("local"))).toEqual({
        name: "local",
        url: Option.some("file:///tmp/my%20registry"),
      });
    }),
  );

  it.effect("selects the effective default when no name is given", () =>
    Effect.gen(function* () {
      expect(yield* target(Option.none(), "origin")).toEqual({
        name: "origin",
        url: Option.some("https://registry.origin.test"),
      });
    }),
  );

  it.effect("names the selection and gives no URL when no configured registry carries it", () =>
    Effect.gen(function* () {
      expect(yield* target(Option.some("missing"))).toEqual({
        name: "missing",
        url: Option.none(),
      });
      expect(yield* target(Option.none(), "missing")).toEqual({
        name: "missing",
        url: Option.none(),
      });
    }),
  );
});
