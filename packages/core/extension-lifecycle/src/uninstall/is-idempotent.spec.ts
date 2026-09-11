import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applyInstall, installRequest, makeInstallWorld } from "../install/test-helpers.js";
import { writeLocalSkillPackage } from "../testing.js";
import { UninstallExtensions } from "./uninstall-extensions.js";
import { applyUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/is-idempotent",
  title: "Uninstalling an extension the workspace does not desire is a safe no-op",
  statement:
    "When uninstall targets an extension the workspace does not desire, whether never installed, already uninstalled, or an inline MCP server whose removal is repeated, it shall report a no-op and shall change no configuration, resolution, canonical content, or agent projection.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["decision-table"],
  derivedFrom: ["cli/mcps/inline-lifecycle-is-idempotent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface AbsentCase {
  readonly label: string;
  readonly prepare: "nothing" | "install-then-uninstall" | "uninstall-inline-mcp";
  /** The removal every row settles, in the terms its route supplies. */
  readonly target: { readonly type?: InstallableExtensionType; readonly selector: string };
  /** The type and names the settled candidate addresses. */
  readonly settles: {
    readonly type: InstallableExtensionType;
    readonly names: ReadonlyArray<string>;
  };
  /** Settings the workspace starts with, beyond the world's own defaults. */
  readonly settings?: Readonly<Record<string, unknown>>;
}

const SKILL_TARGET = "@acme/skills/code-review";
const INLINE_MCP_NAME = "demo";

const absentCases: readonly AbsentCase[] = [
  {
    label: "uninstalling an extension that was never desired reports a no-op",
    prepare: "nothing",
    target: { selector: SKILL_TARGET },
    settles: { type: "skill", names: ["code-review"] },
  },
  {
    label: "repeating a completed uninstall reports a no-op",
    prepare: "install-then-uninstall",
    target: { selector: SKILL_TARGET },
    settles: { type: "skill", names: ["code-review"] },
  },
  {
    // An inline MCP server is desired by the settings document alone, with no
    // source and no locked resolution, so its repeated removal exercises the
    // no-op on an authority the packaged rows never reach.
    label: "repeating the uninstall of an inline MCP server reports a no-op",
    prepare: "uninstall-inline-mcp",
    target: { type: "mcp-server", selector: INLINE_MCP_NAME },
    settles: { type: "mcp-server", names: [INLINE_MCP_NAME] },
    settings: { mcpServers: { [INLINE_MCP_NAME]: { command: "node", args: ["server.js"] } } },
  },
];

describe("Uninstall of an absent extension is safe to repeat", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(absentCases)("$label", ({ prepare, target, settles, settings }) => {
    const world = makeInstallWorld(settings === undefined ? {} : { settings });
    cleanups.push(world.cleanup);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          const removal = uninstallRequest(target);
          if (prepare !== "nothing") {
            if (prepare === "install-then-uninstall") {
              const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
              yield* applyInstall(installRequest({ subject: { kind: "source", source } }));
            }
            // The repeat is only a repeat if the first removal withdrew
            // something; a preparation that was itself a no-op would leave the
            // row asserting nothing.
            expect(deriveOperationOutcome(yield* applyUninstall(removal))).toBe("applied");
          }
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();

          // The root form reads the type from the FQN and settles on the name
          // it addresses, whether or not the workspace still desires it.
          const candidate = yield* UninstallExtensions.prepare(removal);
          expect(candidate.type).toBe(settles.type);
          expect(candidate.names).toEqual(settles.names);

          const resolution = yield* applyUninstall(removal);

          // Nothing was withdrawn, so no unit changed state and the operation
          // resolves as a no-op.
          expect(deriveOperationOutcome(resolution)).toBe("no-op");
          expect(resolution.units.length).toBeGreaterThan(0);
          expect(resolution.units.map((unit) => unit.state)).toEqual(
            resolution.units.map(() => "unchanged"),
          );
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
