import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { getAppError, handleInstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "../../../support/contract.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/local-connection-names-share-source-resolution",
  title: "One registry MCP source supports multiple independently named local connections",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example", "decision-table"],
});

describe("Install locally named MCP connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = () => {
    const registry = makeSpecRegistry();
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
    cleanups.push(workspace.cleanup, registry.cleanup);
    return { workspace };
  };

  const install = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    source: string,
    localName: string,
  ) =>
    handleInstallMcpServer(
      {
        source: Option.some(source),
        localName: Option.some(localName),
        env: [],
      },
      { yes: true, force: false, preview: false },
    ).pipe(Effect.provide(workspace.layer));

  it.effect("records two local settings entries and one accepted source resolution", () =>
    Effect.gen(function* () {
      const { workspace } = setup();

      yield* install(workspace, "@acme/mcps/context", "work-context");
      yield* install(workspace, "@acme/mcps/context", "personal-context");

      expect(workspace.readSettings()).toMatchObject({
        mcpServers: {
          "work-context": "agentxm:@acme/mcps/context",
          "personal-context": "agentxm:@acme/mcps/context",
        },
      });
      const lockfile: unknown = YAML.parse(workspace.readLockfileText());
      expect(lockfile).toMatchObject({ lockfileVersion: 7 });
      if (typeof lockfile !== "object" || lockfile === null || !("mcpServers" in lockfile)) {
        throw new Error("Expected an MCP resolution map");
      }
      expect(Object.keys(lockfile.mcpServers ?? {})).toHaveLength(1);
    }),
  );

  it.effect("uses each local name verbatim as the agent-native MCP key", () =>
    Effect.gen(function* () {
      const { workspace } = setup();

      yield* install(workspace, "@acme/mcps/context", "work-context");
      yield* install(workspace, "@acme/mcps/context", "personal-context");

      const projection: unknown = JSON.parse(workspace.readFile(".mcp.json"));
      expect(projection).toMatchObject({
        mcpServers: {
          "work-context": expect.anything(),
          "personal-context": expect.anything(),
        },
      });
    }),
  );

  it.effect.each(["Uppercase", "-leading", "trailing-", "space name"])(
    "rejects invalid local name %s without mutating workspace state",
    (localName) =>
      Effect.gen(function* () {
        const { workspace } = setup();
        const settingsBefore = workspace.readFile("axm.json");
        const lockBefore = workspace.readLockfileText();

        const failure = yield* install(workspace, "@acme/mcps/context", localName).pipe(
          Effect.flip,
        );

        expect(getAppError(failure).detail).toContain("Local MCP names");
        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
      }),
  );

  it.effect("rejects reusing a local name for a different source without mutation", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      registry.writeMcp("search", [{ version: "1.0.0" }]);
      const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup, registry.cleanup);

      yield* install(workspace, "@acme/mcps/context", "work-tools");
      const settingsBefore = workspace.readFile("axm.json");
      const lockBefore = workspace.readLockfileText();

      const failure = yield* install(workspace, "@acme/mcps/search", "work-tools").pipe(
        Effect.flip,
      );

      expect(getAppError(failure).detail).toContain("already owned by a different source");
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
    }),
  );

  it.effect("rejects --as without a source before mutation", () =>
    Effect.gen(function* () {
      const { workspace } = setup();
      const settingsBefore = workspace.readFile("axm.json");
      const lockBefore = workspace.readLockfileText();

      const failure = yield* handleInstallMcpServer(
        {
          source: Option.none(),
          localName: Option.some("work-context"),
          env: [],
        },
        { yes: true, force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer), Effect.flip);

      expect(getAppError(failure).detail).toContain("--as requires an MCP server source");
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
    }),
  );

  it.effect("rejects non-intersecting version constraints for one shared source closure", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }, { version: "2.0.0" }]);
      const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup, registry.cleanup);

      yield* install(workspace, "@acme/mcps/context@^1.0.0", "work-context");
      const settingsBefore = workspace.readFile("axm.json");
      const lockBefore = workspace.readLockfileText();

      const failure = yield* install(
        workspace,
        "@acme/mcps/context@^2.0.0",
        "personal-context",
      ).pipe(Effect.flip);

      expect(getAppError(failure).detail).toContain("constraints do not intersect");
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
    }),
  );
});
