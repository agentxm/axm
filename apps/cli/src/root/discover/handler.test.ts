import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  RegistryClientFactory,
  RegistryOperationFailed,
  type RegistryClient,
} from "@agentxm/registry-client";
import type { DiscoverPackagesResponse } from "@agentxm/registry-protocol/unstable/registry/discover-schema";

import { startedUnits } from "../../test-support/presenter-test.js";
import { expectNoPlanEnvelope, makeCliTestContext } from "../../test-support/test-helpers.js";
import { ExecutionDirectory } from "../../execution-directory.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { handleDiscover } from "./handler.js";

const companion = (name: string, official: boolean, attestedBy: ReadonlyArray<string>) => ({
  ref: `@acme/skills/${name}`,
  resolved: true,
  extension: { owner: "@acme", type: "skill", name, installVersion: "1.0.0" },
  attestedBy,
  official,
  packageVersionInRange: true,
});

/** The composition root's factory, stubbed to answer discovery without transport. */
const stubFactoryLayer = (respond: () => DiscoverPackagesResponse | undefined) =>
  Layer.succeed(RegistryClientFactory, {
    forLocation: () => Effect.succeed(makeStubClient(respond)),
    forDefaultRegistry: Effect.die("Discover must resolve each declared source directly"),
  });

const makeStubClient = (respond: () => DiscoverPackagesResponse | undefined): RegistryClient =>
  ({
    discoverPackages: () => {
      const response = respond();
      return response === undefined
        ? Effect.fail(
            new RegistryOperationFailed({
              category: "unavailable",
              detail: "Fixture Registry unavailable",
            }),
          )
        : Effect.succeed(response);
    },
  }) as unknown as RegistryClient;

interface ProjectFixture {
  readonly root: string;
  readonly cleanup: () => void;
}

const makeProject = (files: Readonly<Record<string, unknown>>): ProjectFixture => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-cli-discover-")));
  for (const [relative, value] of Object.entries(files)) {
    const file = nodePath.join(root, relative);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
};

const twoPackageProject = {
  "package.json": { dependencies: { react: "18.2.0" }, devDependencies: { vitest: "3.2.1" } },
  "node_modules/react/package.json": {
    name: "react",
    version: "18.2.0",
    agentExtensions: [{ ref: "@acme/skills/react-testing" }],
  },
  "node_modules/vitest/package.json": {
    name: "vitest",
    version: "3.2.1",
    agentExtensions: [{ ref: "@acme/skills/effect-testing" }],
  },
};

const twoPackageResponse = {
  results: [
    {
      purl: "pkg:npm/react",
      version: "18.2.0",
      status: "resolved",
      extensions: [companion("react-testing", true, ["package", "extension"])],
    },
    {
      purl: "pkg:npm/vitest",
      version: "3.2.1",
      status: "resolved",
      extensions: [companion("effect-testing", false, ["extension"])],
    },
  ],
} as unknown as DiscoverPackagesResponse;

const runHandler = (
  project: ProjectFixture,
  respond: () => DiscoverPackagesResponse | undefined,
  options?: { readonly machine?: boolean },
) => {
  const context = makeCliTestContext(options?.machine === true ? { machine: true } : {});
  const program = handleDiscover({ path: Option.none() }).pipe(
    Effect.provideService(ExecutionDirectory, { path: decodeAbsolutePathSync(project.root) }),
    // The stub comes last: it replaces the base layer's live Registry client
    // factory for this handler run.
    Effect.provide(Layer.mergeAll(context.baseLayer, stubFactoryLayer(respond))),
  );
  return { rendererState: context.rendererState, program };
};

describe("discover handler", () => {
  it.effect("renders compatible extensions as a single list payload in human mode", () => {
    const project = makeProject(twoPackageProject);
    const { program, rendererState } = runHandler(project, () => twoPackageResponse);
    return program.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.docs).toHaveLength(1);
          expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual(
            expect.objectContaining({
              _tag: "table",
              rows: expect.arrayContaining([
                expect.objectContaining({
                  cells: expect.arrayContaining([
                    "@acme/skills/react-testing",
                    "https://registry.agentxm.ai/",
                    "react@18.2.0",
                  ]),
                }),
                expect.objectContaining({
                  cells: expect.arrayContaining(["@acme/skills/effect-testing", "vitest@3.2.1"]),
                }),
              ]),
            }),
          );
          expect(startedUnits(rendererState)).toEqual(["project dependencies"]);
        }),
      ),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });

  it.effect("emits a structured empty list when no companion extensions are found", () => {
    const project = makeProject({});
    const { program, rendererState } = runHandler(
      project,
      () => ({ results: [] }) as unknown as DiscoverPackagesResponse,
    );
    return program.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual({
            _tag: "paragraph",
            text: "No dependencies detected in this project.",
          });
        }),
      ),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });

  it.effect("does not consult a Registry for packages without recommendations", () => {
    const project = makeProject({
      "package.json": { dependencies: { react: "18.2.0" } },
      "node_modules/react/package.json": { name: "react", version: "18.2.0" },
    });
    const { program, rendererState } = runHandler(project, () => undefined);
    return program.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          const doc = rendererState.docs.flatMap((entry) => entry.doc);
          expect(doc).toContainEqual({
            _tag: "paragraph",
            text: "No companion extensions for the 1 package this project depends on.",
          });
          expect(doc).not.toContainEqual(
            expect.objectContaining({
              text: [{ text: "One or more Registry sources unavailable", tone: "warn" }],
            }),
          );
        }),
      ),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });

  it.effect("keeps registry unavailable as summary context for non-empty results", () => {
    const project = makeProject({
      "package.json": { dependencies: { react: "18.2.0" } },
      "node_modules/react/package.json": {
        name: "react",
        version: "18.2.0",
        agentExtensions: [{ ref: "@acme/skills/react-testing" }],
      },
    });
    const { program, rendererState } = runHandler(project, () => undefined);
    return program.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.docs).toHaveLength(1);
          expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual(
            expect.objectContaining({
              _tag: "summary",
              parts: [
                { text: "1 companion extension for 1 of 1 detected package" },
                {
                  text: [{ text: "One or more Registry sources unavailable", tone: "warn" }],
                },
                { text: [{ text: "axm view <extension> for details", tone: "dim" }] },
              ],
            }),
          );
        }),
      ),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });

  it.effect("emits machine-readable items in machine mode", () => {
    const project = makeProject(twoPackageProject);
    const { program, rendererState } = runHandler(project, () => twoPackageResponse, {
      machine: true,
    });
    return program.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.results).toHaveLength(1);
          expect(rendererState.results[0]?.data).toMatchObject({
            count: 2,
            totalDetected: 2,
            registryAvailable: true,
          });
          expect(rendererState.results[0]?.data).toEqual(
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({
                  package: "pkg:npm/react@18.2.0",
                  extensions: expect.arrayContaining([
                    expect.objectContaining({
                      name: "react-testing",
                      source: { type: "registry", url: "https://registry.agentxm.ai/" },
                    }),
                  ]),
                }),
              ]),
            }),
          );
          expectNoPlanEnvelope(rendererState.results[0]?.data);
        }),
      ),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });
});
