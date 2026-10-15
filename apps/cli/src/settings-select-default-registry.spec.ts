import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { RegistryContext, type RegistrySelectionFailure } from "@agentxm/registry-client";
import {
  registrySelectionFailedStepFailure,
  registrySourceUnknownStepFailure,
} from "@agentxm/workspace-kernel/planning";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeRegistryContextLayer } from "./runtime.js";

export const specification = defineSpecification({
  requirement: "cli/settings-select-default-registry",
  title: "Settings select one default Registry",
  statement:
    "AXM shall select one effective default Registry from project settings, then user settings, then the built-in AgentXM source, and an explicit Registry only by a configured source name or an http(s) origin; shall treat a malformed settings document, an invalid, reserved, or duplicate source name, an unknown selected source, or a Registry location that is not an http(s) origin or a file URL as a typed failure naming the settings that caused it, never selecting another Registry; and shall read and validate that selection only when a command first needs a Registry.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "extension-adoption", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The composition root reads real project and user settings through the production document loaders; built-CLI authentication, non-Registry commands, and publish rows are bound evidence for the process boundary.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/help/topics/settings.md",
    "apps/cli/src/runtime.ts",
    "packages/core/workspace-kernel/src/workspace-state/workspace/registry-selection.ts",
    "extension-identity/registry-endpoints-have-one-meaning",
  ],
  supersedes: [
    "cli/environment-selects-built-in-extension-source",
    "cli/environment-selects-registry-services",
  ],
  assumptions: [],
  openQuestions: [],
});

interface SettingsFixture {
  readonly project: string;
  readonly home: string;
  readonly projectSettings: string;
  readonly userSettings: string;
  readonly cleanup: () => void;
}

const makeSettingsFixture = (): SettingsFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-default-registry-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(home, ".axm", "workspace"), { recursive: true });
  return {
    project,
    home,
    projectSettings: path.join(project, "axm.json"),
    userSettings: path.join(home, ".axm", "workspace", "axm.json"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

const source = (name: string, location: string) => ({ name, type: "registry", location });

const writeSettings = (file: string, value: unknown): void =>
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));

const contextFor = (fixture: SettingsFixture, explicit: Option.Option<string> = Option.none()) =>
  Layer.provide(
    makeRegistryContextLayer(decodeAbsolutePathSync(fixture.project), explicit),
    Layer.merge(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: fixture.home } })),
      Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer),
    ),
  );

/** The selection the invocation's operation addresses, as `{ name, href, reason }`. */
const select = (fixture: SettingsFixture, explicit: Option.Option<string> = Option.none()) =>
  Effect.flatMap(RegistryContext, (context) => context.bound).pipe(
    Effect.map((bound) => ({
      name: bound.name,
      href: bound.endpoint.href,
      reason: bound.reason,
      settingsPath: Option.getOrUndefined(bound.settingsPath),
    })),
    Effect.provide(contextFor(fixture, explicit)),
  );

const failureOf = (fixture: SettingsFixture, explicit: Option.Option<string> = Option.none()) =>
  select(fixture, explicit).pipe(Effect.flip);

/** What a person or agent is shown for a selection failure. */
const describeFailure = (failure: RegistrySelectionFailure): string => {
  const rendered =
    failure._tag === "RegistrySourceUnknown"
      ? registrySourceUnknownStepFailure(failure)
      : registrySelectionFailedStepFailure(failure);
  return JSON.stringify({
    detail: rendered.detail,
    problem: rendered.problem,
    suggestions: rendered.suggestions,
  });
};

const withFixture = <A, E>(
  setup: (fixture: SettingsFixture) => void,
  body: (fixture: SettingsFixture) => Effect.Effect<A, E>,
) => {
  const fixture = makeSettingsFixture();
  setup(fixture);
  return body(fixture).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
};

describe("Settings-selected default Registry", () => {
  it.effect("uses the immutable built-in when neither scope selects a source", () =>
    withFixture(
      () => undefined,
      (fixture) =>
        Effect.gen(function* () {
          expect(yield* select(fixture)).toEqual({
            name: "agentxm",
            href: "https://registry.agentxm.ai",
            reason: "built-in",
            settingsPath: undefined,
          });
        }),
    ),
  );

  it.effect("uses the user default when the project has no selection", () =>
    withFixture(
      (fixture) =>
        writeSettings(fixture.userSettings, {
          defaultRegistry: "company",
          sources: [source("company", "https://registry.company.test")],
        }),
      (fixture) =>
        Effect.gen(function* () {
          expect(yield* select(fixture)).toEqual({
            name: "company",
            href: "https://registry.company.test",
            reason: "user-default",
            settingsPath: fixture.userSettings,
          });
        }),
    ),
  );

  it.effect("uses the project default before the user default", () =>
    withFixture(
      (fixture) => {
        writeSettings(fixture.userSettings, {
          defaultRegistry: "company",
          sources: [source("company", "https://registry.company.test")],
        });
        writeSettings(fixture.projectSettings, {
          defaultRegistry: "project",
          sources: [source("project", "https://registry.project.test")],
        });
      },
      (fixture) =>
        Effect.gen(function* () {
          expect(yield* select(fixture)).toMatchObject({
            name: "project",
            href: "https://registry.project.test",
            reason: "project-default",
          });
        }),
    ),
  );

  it.effect.each([
    { configured: "https://registry.company.test/", rendered: "https://registry.company.test" },
    { configured: "https://REGISTRY.company.test:443", rendered: "https://registry.company.test" },
    { configured: "http://localhost:4300/", rendered: "http://localhost:4300" },
  ] as const)("canonicalizes $configured to its origin", ({ configured, rendered }) =>
    withFixture(
      (fixture) =>
        writeSettings(fixture.projectSettings, {
          defaultRegistry: "company",
          sources: [source("company", configured)],
        }),
      (fixture) =>
        Effect.gen(function* () {
          expect((yield* select(fixture)).href).toBe(rendered);
        }),
    ),
  );

  it.effect("keeps a file-backed default Registry as its canonical directory URL", () =>
    withFixture(
      (fixture) => {
        fs.mkdirSync(path.join(fixture.project, "registry"));
        writeSettings(fixture.projectSettings, {
          defaultRegistry: "fixture",
          sources: [
            source("fixture", `${pathToFileURL(path.join(fixture.project, "registry")).href}/`),
          ],
        });
      },
      (fixture) =>
        Effect.gen(function* () {
          expect((yield* select(fixture)).href).toBe(
            pathToFileURL(path.join(fixture.project, "registry")).href,
          );
        }),
    ),
  );

  it.effect("selects an explicit Registry by configured name or http(s) origin", () =>
    withFixture(
      (fixture) =>
        writeSettings(fixture.projectSettings, {
          sources: [source("company", "https://registry.company.test")],
        }),
      (fixture) =>
        Effect.gen(function* () {
          expect(yield* select(fixture, Option.some("company"))).toMatchObject({
            name: "company",
            href: "https://registry.company.test",
            reason: "named-source",
            settingsPath: fixture.projectSettings,
          });
          expect(yield* select(fixture, Option.some("https://registry.other.test/"))).toMatchObject(
            { href: "https://registry.other.test", reason: "explicit-url" },
          );
        }),
    ),
  );

  it.effect("refuses an unknown default or named source instead of selecting another", () =>
    withFixture(
      (fixture) => writeSettings(fixture.projectSettings, { defaultRegistry: "missing" }),
      (fixture) =>
        Effect.gen(function* () {
          const unknownDefault = yield* failureOf(fixture);
          expect(unknownDefault).toMatchObject({
            _tag: "RegistrySourceUnknown",
            name: "missing",
            scope: "project",
            settingsPath: Option.some(fixture.projectSettings),
          });
          // An explicit selection does not excuse settings that cannot select
          // a default.
          const explicit = yield* failureOf(fixture, Option.some("https://registry.other.test"));
          expect(explicit._tag).toBe("RegistrySourceUnknown");
        }),
    ),
  );

  it.effect("refuses an explicit name no settings configure", () =>
    withFixture(
      () => undefined,
      (fixture) =>
        Effect.gen(function* () {
          expect(yield* failureOf(fixture, Option.some("company"))).toMatchObject({
            _tag: "RegistrySourceUnknown",
            name: "company",
            scope: "explicit",
          });
        }),
    ),
  );

  it.effect.each([
    { selector: "ftp://registry.example.test", problem: "unsupported scheme" },
    { selector: "https://registry.example.test/axm", problem: "path" },
    { selector: "https://user:hunter2@registry.example.test", problem: "credentials" },
    { selector: "https://registry.example.test/?token=hunter2", problem: "query" },
    { selector: "file:///srv/registry", problem: "file URL" },
  ] as const)("refuses --registry $selector ($problem) without echoing secrets", ({ selector }) =>
    withFixture(
      () => undefined,
      (fixture) =>
        Effect.gen(function* () {
          const failure = yield* failureOf(fixture, Option.some(selector));
          expect(failure._tag).toBe("RegistrySelectionFailed");
          expect(describeFailure(failure)).toContain("--registry");
          expect(describeFailure(failure)).not.toContain("hunter2");
        }),
    ),
  );

  it.effect.each([
    {
      label: "a path-hosted http(s) location",
      settings: { defaultRegistry: "company", sources: [source("company", "https://x.test/axm")] },
    },
    {
      label: "a location with embedded credentials",
      settings: { sources: [source("company", "https://user:hunter2@x.test")] },
    },
    {
      label: "a native path written as a location",
      settings: { sources: [source("company", "C:/reg")] },
    },
    {
      label: "a reserved source name",
      settings: { sources: [source("local", "https://registry.company.test")] },
    },
    {
      label: "duplicate source names",
      settings: {
        sources: [
          source("company", "https://registry.company.test"),
          source("company", "https://registry.other.test"),
        ],
      },
    },
    { label: "a malformed document", settings: "{ not json" },
  ] as const)("refuses $label as a typed settings failure", ({ settings }) =>
    withFixture(
      (fixture) => writeSettings(fixture.projectSettings, settings),
      (fixture) =>
        Effect.gen(function* () {
          for (const explicit of [Option.none(), Option.some("https://registry.other.test")]) {
            const failure = yield* failureOf(fixture, explicit);
            expect(failure._tag).toBe("RegistrySelectionFailed");
            expect(describeFailure(failure)).toContain(fixture.projectSettings);
            expect(describeFailure(failure)).not.toContain("hunter2");
          }
        }),
    ),
  );

  it.effect("refuses project settings it cannot read, naming the file", () =>
    withFixture(
      // A directory where the settings document belongs exists but cannot be
      // read as one.
      (fixture) => fs.mkdirSync(fixture.projectSettings),
      (fixture) =>
        Effect.gen(function* () {
          for (const explicit of [Option.none(), Option.some("https://registry.other.test")]) {
            const failure = yield* failureOf(fixture, explicit);
            // Unreadable storage, not invalid content, and never another Registry.
            expect(
              failure._tag === "RegistrySelectionFailed"
                ? registrySelectionFailedStepFailure(failure)
                : failure,
            ).toMatchObject({ category: "unavailable", title: "Workspace settings unreadable" });
            expect(describeFailure(failure)).toContain(fixture.projectSettings);
          }
        }),
    ),
  );

  it.effect("reads no settings until the selection is first needed", () =>
    withFixture(
      (fixture) => writeSettings(fixture.projectSettings, "{ not json"),
      (fixture) =>
        Effect.gen(function* () {
          // Building the context succeeds over malformed settings; only asking
          // for the Registry reports them.
          const context = yield* RegistryContext;
          const failure = yield* context.bound.pipe(Effect.flip);
          expect(failure._tag).toBe("RegistrySelectionFailed");
        }).pipe(Effect.provide(contextFor(fixture))),
    ),
  );
});
