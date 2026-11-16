import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { AdoptMcpServers } from "../index.js";
import { prepareMcpAdoptionTargets } from "./apply.js";
import { makeConfigurationFixture, type ConfigurationFixtureOptions } from "../testing.js";

const remote = { type: "http", url: "https://mcp.example.test/alpha" };

const singleRemoteServer: ConfigurationFixtureOptions = {
  settings: { agents: ["claude-code"] },
  files: { ".mcp.json": JSON.stringify({ mcpServers: { alpha: remote } }) },
};

const twoRemoteServers: ConfigurationFixtureOptions = {
  settings: { agents: ["claude-code"] },
  files: {
    ".mcp.json": JSON.stringify({
      mcpServers: { alpha: remote, beta: { type: "http", url: "https://mcp.example.test/beta" } },
    }),
  },
};

/**
 * Run `body` in a fixture whose services read through a recording filesystem
 * over the real temporary workspace.
 */
const withRecordedFixture = <A, E, R>(
  options: ConfigurationFixtureOptions,
  body: Effect.Effect<A, E, R>,
) => {
  const fixture = makeConfigurationFixture(options);
  return fixture.provide(body).pipe(
    Effect.provide(
      // The recorder's FileSystem replaces the one NodeServices provides.
      Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeFileSystem.layer)),
    ),
    Effect.ensuring(Effect.sync(fixture.cleanup)),
  );
};

describe("native MCP discovery for import", () => {
  it.effect("reads the selected native file as often as the full adoption preparation", () =>
    withRecordedFixture(
      singleRemoteServer,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const prepared = yield* AdoptMcpServers.prepare(["alpha"]);
        const filePath = prepared.preflight.candidates[0]?.adoptions[0]?.filePath ?? "";
        expect(recording.contentReads(filePath)).toBeGreaterThan(0);

        recording.reset();
        const discovered = yield* AdoptMcpServers.discover(["alpha"]);
        const discoverReads = recording.contentReads(filePath);

        recording.reset();
        const preparedAgain = yield* AdoptMcpServers.prepare(["alpha"]);
        const prepareReads = recording.contentReads(filePath);

        expect(discovered.preflight).toEqual(preparedAgain.preflight);
        expect({ discoverReads, prepareReads }).toEqual({ discoverReads: 3, prepareReads: 3 });
      }),
    ),
  );

  it.effect("keeps the source read of the freshness check and of the adoption step", () =>
    withRecordedFixture(
      singleRemoteServer,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const prepared = yield* AdoptMcpServers.prepare(["alpha"]);
        const filePath = prepared.preflight.candidates[0]?.adoptions[0]?.filePath ?? "";

        recording.reset();
        yield* AdoptMcpServers.previewOrApply(prepared, preapprovedPlanExecution);
        const applyReads = recording.contentReads(filePath);

        expect(applyReads).toBe(21);
      }),
    ),
  );

  it.effect("does no target work for a name that is not discovered", () =>
    withRecordedFixture(
      singleRemoteServer,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const valid = yield* AdoptMcpServers.prepare(["alpha"]);
        const filePath = valid.preflight.candidates[0]?.adoptions[0]?.filePath ?? "";

        recording.reset();
        const discovered = yield* AdoptMcpServers.discover(["missing"]);
        const discoverReads = recording.contentReads(filePath);

        recording.reset();
        const prepared = yield* AdoptMcpServers.prepare(["missing"]);
        const prepareReads = recording.contentReads(filePath);

        expect(discovered.preflight.conflicts.map((finding) => finding.name)).toEqual(["missing"]);
        expect(discovered.preflight).toEqual(prepared.preflight);
        expect({ discoverReads, prepareReads }).toEqual({ discoverReads: 1, prepareReads: 1 });
      }),
    ),
  );

  it.effect("classifies a server defined differently across agents as prepare does", () =>
    withRecordedFixture(
      {
        settings: { agents: ["claude-code", "cursor"] },
        files: {
          ".mcp.json": JSON.stringify({ mcpServers: { alpha: remote } }),
          ".cursor/mcp.json": JSON.stringify({
            mcpServers: { alpha: { url: "https://mcp.example.test/other" } },
          }),
        },
      },
      Effect.gen(function* () {
        const discovered = yield* AdoptMcpServers.discover(["alpha"]);
        const prepared = yield* AdoptMcpServers.prepare(["alpha"]);
        expect(discovered.preflight.conflicts.map((finding) => finding.name)).toContain("alpha");
        expect(discovered.preflight).toEqual(prepared.preflight);
      }),
    ),
  );

  it.effect("refuses a target the inline validation rejects with prepare's refusal", () =>
    withRecordedFixture(
      {
        settings: { agents: ["pi"] },
        files: {
          ".pi/mcp.json": JSON.stringify({
            mcpServers: {
              "foo-bar": remote,
              foo_bar: { type: "http", url: "https://mcp.example.test/other" },
            },
          }),
        },
      },
      Effect.gen(function* () {
        const discovered = yield* AdoptMcpServers.discover(["foo-bar"]).pipe(Effect.flip);
        const prepared = yield* AdoptMcpServers.prepare(["foo-bar"]).pipe(Effect.flip);
        expect(discovered).toMatchObject({
          detail: "Pi server names collide after native hyphen/underscore normalization",
        });
        expect(discovered).toEqual(prepared);
      }),
    ),
  );

  it.effect("resolves and reads a target file shared by several candidates once", () =>
    withRecordedFixture(
      twoRemoteServers,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const warm = yield* AdoptMcpServers.prepare(["alpha", "beta"]);
        const filePath = warm.preflight.candidates[0]?.adoptions[0]?.filePath ?? "";
        expect(warm.preflight.candidates.map((candidate) => candidate.name)).toEqual([
          "alpha",
          "beta",
        ]);

        recording.reset();
        const prepared = yield* AdoptMcpServers.prepare(["alpha", "beta"]);
        const prepareReads = recording.contentReads(filePath);

        recording.reset();
        const discovered = yield* AdoptMcpServers.discover(["alpha", "beta"]);
        const discoverReads = recording.contentReads(filePath);

        // Validating each candidate on its own, as the locked freshness check does.
        const oneAtATime = yield* prepareMcpAdoptionTargets(prepared.preflight.candidates);

        expect(prepared.nativeLocations).toEqual(oneAtATime);
        expect(prepared.nativeLocations.map((location) => location.address)).toEqual([
          { kind: "key-path", path: filePath, keys: ["mcpServers", "alpha"] },
          { kind: "key-path", path: filePath, keys: ["mcpServers", "beta"] },
        ]);
        expect(discovered.preflight).toEqual(prepared.preflight);
        expect({ discoverReads, prepareReads }).toEqual({ discoverReads: 3, prepareReads: 3 });
      }),
    ),
  );

  it.effect("keeps each candidate's own freshness reads when adopting several", () =>
    withRecordedFixture(
      twoRemoteServers,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const prepared = yield* AdoptMcpServers.prepare(["alpha", "beta"]);
        const filePath = prepared.preflight.candidates[0]?.adoptions[0]?.filePath ?? "";

        recording.reset();
        yield* AdoptMcpServers.previewOrApply(prepared, preapprovedPlanExecution);

        // The locked freshness check and the adoption step validate each candidate on its own.
        expect(recording.contentReads(filePath)).toBe(37);
      }),
    ),
  );

  it.effect("refuses a later candidate the inline validation rejects with its own refusal", () =>
    withRecordedFixture(
      {
        settings: { agents: ["pi"] },
        files: {
          ".pi/mcp.json": JSON.stringify({
            mcpServers: {
              alpha: remote,
              "foo-bar": remote,
              foo_bar: { type: "http", url: "https://mcp.example.test/other" },
            },
          }),
        },
      },
      Effect.gen(function* () {
        const discovered = yield* AdoptMcpServers.discover(["alpha", "foo-bar"]).pipe(Effect.flip);
        const prepared = yield* AdoptMcpServers.prepare(["alpha", "foo-bar"]).pipe(Effect.flip);
        expect(discovered).toMatchObject({
          detail: "Pi server names collide after native hyphen/underscore normalization",
        });
        expect(discovered).toEqual(prepared);
      }),
    ),
  );

  it.effect("yields a discovery that adoption cannot apply", () =>
    withRecordedFixture(
      singleRemoteServer,
      Effect.gen(function* () {
        const discovered = yield* AdoptMcpServers.discover(["alpha"]);
        // Building the effect runs nothing; the assertion is the compiler's refusal.
        const refused = AdoptMcpServers.previewOrApply(
          // @ts-expect-error McpAdoptionDiscovery carries no adoption targets
          discovered,
          preapprovedPlanExecution,
        );
        expect(Effect.isEffect(refused)).toBe(true);
      }),
    ),
  );
});
