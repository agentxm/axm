import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ExtensionCurrencyEntry } from "@agentxm/client-core/unstable/workspace";
import { decodeExactSemverVersionSync } from "@agentxm/client-core/unstable/version-constraints";

import { makeCliTestContext } from "../../test-helpers.js";
import { handleOutdatedWith } from "./handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const v = decodeExactSemverVersionSync;

const makeEntry = (
  overrides: Partial<ExtensionCurrencyEntry> & {
    readonly ref: string;
    readonly type: ExtensionCurrencyEntry["type"];
  },
): ExtensionCurrencyEntry => ({
  ref: overrides.ref,
  type: overrides.type,
  installedVersion: overrides.installedVersion ?? v("1.0.0"),
  constraint: overrides.constraint ?? Option.none(),
  currency: overrides.currency ?? {
    status: "current",
    installedVersion: overrides.installedVersion ?? v("1.0.0"),
    latestMatching: Option.some(overrides.installedVersion ?? v("1.0.0")),
    latestAvailable: overrides.installedVersion ?? v("1.0.0"),
  },
});

const outdatedSkill: ExtensionCurrencyEntry = makeEntry({
  ref: "@acme/skills/code-review",
  type: "skill",
  installedVersion: v("1.0.0"),
  constraint: Option.some("^1.0.0") as ExtensionCurrencyEntry["constraint"],
  currency: {
    status: "update-available",
    installedVersion: v("1.0.0"),
    latestMatching: Option.some(v("1.2.0")),
    latestAvailable: v("1.2.0"),
  },
});

const majorUpdateCommand: ExtensionCurrencyEntry = makeEntry({
  ref: "@acme/commands/deploy",
  type: "command",
  installedVersion: v("1.0.0"),
  currency: {
    status: "major-update-available",
    installedVersion: v("1.0.0"),
    latestMatching: Option.some(v("1.0.0")),
    latestAvailable: v("2.0.0"),
  },
});

const currentPack: ExtensionCurrencyEntry = makeEntry({
  ref: "@acme/packs/frontend",
  type: "pack",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("outdated handler", () => {
  it.effect("renders outdated extensions as a table in human mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () =>
      Effect.succeed([outdatedSkill, majorUpdateCommand, currentPack]),
    ).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toHaveLength(1);
          expect(rendererState.tables[0]?.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                extension: "@acme/skills/code-review",
                installed: "1.0.0",
                constraint: "^1.0.0",
                latest: "1.2.0",
              }),
              expect.objectContaining({
                extension: "@acme/commands/deploy",
                installed: "1.0.0",
                latest: "2.0.0 (major)",
              }),
            ]),
          );
          // current pack should not appear
          expect(rendererState.tables[0]?.items).toHaveLength(2);
        }),
      ),
    );
  });

  it.effect("shows success message when all extensions are current", () => {
    const { baseLayer, rendererState, logs } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([currentPack])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toHaveLength(0);
          expect(logs.success).toContain("All extensions are up to date.");
        }),
      ),
    );
  });

  it.effect("shows info message when no configured extensions exist", () => {
    const { baseLayer, logs } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(logs.info).toContain("No configured extensions.");
        }),
      ),
    );
  });

  it.effect("passes type filter to collector", () => {
    const { baseLayer } = makeCliTestContext();
    const collectedTypes: Array<Option.Option<string>> = [];

    return handleOutdatedWith({ type: Option.some("skill") }, (type) => {
      collectedTypes.push(type);
      return Effect.succeed([]);
    }).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(collectedTypes).toHaveLength(1);
          expect(Option.getOrUndefined(collectedTypes[0] as Option.Option<string>)).toBe("skill");
        }),
      ),
    );
  });

  it.effect("emits JSON document in machine mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext({ machine: true });

    return handleOutdatedWith({ type: Option.none() }, () =>
      Effect.succeed([outdatedSkill, majorUpdateCommand, currentPack]),
    ).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.results).toHaveLength(1);
          const doc = rendererState.results[0]?.data;
          expect(doc).toMatchObject({
            _version: 1,
            command: "outdated",
            count: 2,
          });
          expect(doc).toEqual(
            expect.objectContaining({
              data: expect.arrayContaining([
                expect.objectContaining({
                  ref: "@acme/skills/code-review",
                  type: "skill",
                  installedVersion: "1.0.0",
                  constraint: "^1.0.0",
                  latestMatching: "1.2.0",
                  latestAvailable: "1.2.0",
                  status: "update-available",
                }),
                expect.objectContaining({
                  ref: "@acme/commands/deploy",
                  type: "command",
                  installedVersion: "1.0.0",
                  latestAvailable: "2.0.0",
                  status: "major-update-available",
                }),
              ]),
            }),
          );
        }),
      ),
    );
  });

  it.effect("emits empty JSON document when no extensions configured", () => {
    const { baseLayer, rendererState } = makeCliTestContext({ machine: true });

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.results).toHaveLength(1);
          expect(rendererState.results[0]?.data).toMatchObject({
            _version: 1,
            command: "outdated",
            count: 0,
            data: [],
          });
        }),
      ),
    );
  });

  it.effect("summary line shows correct count", () => {
    const { baseLayer, logs } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([outdatedSkill])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(logs.info).toContain("1 extension has updates available.");
        }),
      ),
    );
  });
});
