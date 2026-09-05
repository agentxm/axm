import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/local-name-requests-are-validated-before-any-change",
  title: "Locally named MCP install requests are validated before any workspace change",
  statement:
    "When an MCP install names a local connection with --as, AXM shall reject the request before any workspace change, with an error naming the violated rule, if the local name is invalid, the name is owned by a different source, the version constraint does not intersect the source's existing constraints, or --as is given without a source.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/mcps/install/local-connection-names-share-source-resolution"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Validate locally named MCP install requests", () => {
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
      { force: false, preview: false },
    ).pipe(Effect.provide(workspace.layer));

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
        { force: false, preview: false },
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
