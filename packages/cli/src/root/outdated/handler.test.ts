import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  ExtensionCurrencyEntry,
  ExtensionSourceFreshnessEntry,
} from "@agentxm/client-core/unstable/workspace";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

import { expectNoPlanEnvelope, makeCliTestContext } from "../../test-helpers.js";
import { INSTALL_EXTENSION_FROM_REGISTRY } from "../suggested-actions.js";
import { handleOutdatedWith } from "./handler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const v = decodeVersionSync;

const makeEntry = (
  overrides: Partial<ExtensionCurrencyEntry> & {
    readonly ref: string;
    readonly type: ExtensionCurrencyEntry["type"];
  },
): ExtensionCurrencyEntry => ({
  kind: "registry-version",
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

const changedSourceSkill: ExtensionSourceFreshnessEntry = {
  kind: "source-freshness",
  ref: "skills/find-skills",
  type: "skill",
  source: "github:vercel-labs/skills//skills/find-skills",
  installedTreeHash: Option.some("1111111111111111111111111111111111111111"),
  currentTreeHash: Option.some("2222222222222222222222222222222222222222"),
  status: "changed",
  reason: Option.none(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("outdated handler", () => {
  it.effect("renders outdated extensions as a single list payload in human mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () =>
      Effect.succeed([outdatedSkill, majorUpdateCommand, currentPack]),
    ).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 2,
            items: expect.arrayContaining([
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
            summary: "2 extensions have updates available.",
          });
          // current pack should not appear
          expect(JSON.stringify(rendererState.results[1]?.data)).not.toContain(
            "@acme/packs/frontend",
          );
        }),
      ),
    );
  });

  it.effect("emits a single empty outdated list when all extensions are current", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([currentPack])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toHaveLength(0);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 0,
            items: [],
            emptyMessage: "All extensions are up to date.",
          });
        }),
      ),
    );
  });

  it.effect("emits a single empty outdated list when no configured extensions exist", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 0,
            items: [],
            emptyMessage: "No configured extensions.",
          });
          expect(rendererState.suggestions).toEqual([INSTALL_EXTENSION_FROM_REGISTRY]);
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
            count: 2,
          });
          expect(doc).toEqual(
            expect.objectContaining({
              data: expect.arrayContaining([
                expect.objectContaining({
                  kind: "registry-version",
                  ref: "@acme/skills/code-review",
                  type: "skill",
                  installedVersion: "1.0.0",
                  constraint: "^1.0.0",
                  latestMatching: "1.2.0",
                  latestAvailable: "1.2.0",
                  status: "update-available",
                }),
                expect.objectContaining({
                  kind: "registry-version",
                  ref: "@acme/commands/deploy",
                  type: "command",
                  installedVersion: "1.0.0",
                  latestAvailable: "2.0.0",
                  status: "major-update-available",
                }),
              ]),
            }),
          );
          expectNoPlanEnvelope(doc);
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
            count: 0,
            data: [],
          });
          expectNoPlanEnvelope(rendererState.results[0]?.data);
          expect(rendererState.suggestions).toEqual([INSTALL_EXTENSION_FROM_REGISTRY]);
        }),
      ),
    );
  });

  it.effect("summary payload shows correct singular count", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () => Effect.succeed([outdatedSkill])).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 1,
            summary: "1 extension has updates available.",
          });
        }),
      ),
    );
  });

  it.effect("renders Git-hosted source freshness rows", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleOutdatedWith({ type: Option.none() }, () =>
      Effect.succeed([changedSourceSkill]),
    ).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 1,
            items: [
              expect.objectContaining({
                extension: "skills/find-skills",
                installed: "111111111111",
                constraint: "source",
                latest: "222222222222",
              }),
            ],
            summary: "1 extension has updates available.",
          });
        }),
      ),
    );
  });
});
