import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { localLifecycleRows } from "./test-helpers.js";
import { operationNativeLocations } from "@agentxm/workspace-kernel/operations";
import {
  previewInstall,
  applyInstall,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/install/realizes-for-every-configured-agent",
  title: "Install realizes the extension for every configured agent",
  statement:
    "When an acquirable extension is installed, AXM shall realize it on every native surface supported for that extension type by the configured agents and on its declared shared surfaces, shall report those physical units before first acquisition without claiming current ownership, and shall report the realized units after apply, as permitted by the workspace's activation and instruction settings.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "extension-adoption"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the shared Skill policy location.",
  ],
  openQuestions: [],
});

const SKILL = "code-review";
const REALIZED_LOCATIONS = [
  `.agents/skills/${SKILL}`,
  `.claude/skills/${SKILL}`,
  `.cursor/skills/${SKILL}`,
];

describe("Install realizes the extension for configured agents", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("realizes the extension for every configured agent", () => {
    const { workspace, cleanup } = makeInstallWorld({
      settings: { agents: ["claude-code", "cursor"] },
    });
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: SKILL });
    for (const location of REALIZED_LOCATIONS) {
      expect(workspace.exists(location), location).toBe(false);
    }
    return workspace
      .provide(
        Effect.gen(function* () {
          const request = installRequest({ type: "skill", subject: { kind: "source", source } });
          const preview = yield* previewInstall(request);
          const proposed = operationNativeLocations(preview);
          expect(proposed).toHaveLength(3);
          expect(
            proposed.every((unit) => unit.state === "created" && unit.ownership === "absent"),
          ).toBe(true);
          for (const location of REALIZED_LOCATIONS) expect(workspace.exists(location)).toBe(false);
          const applied = yield* applyInstall(request);
          expect(
            operationNativeLocations(applied)
              .map((unit) => unit.address.path)
              .sort(),
          ).toEqual(proposed.map((unit) => unit.address.path).sort());

          for (const location of REALIZED_LOCATIONS) {
            expect(workspace.readFile(`${location}/SKILL.md`), location).toBe(
              workspace.readFile(`vendor/${SKILL}/src/SKILL.md`),
            );
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(localLifecycleRows)(
    "realizes the applicable agent surfaces for a local $label",
    ({ type, label, writePackage, expectRealized }) => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const name = `conformance-${label}`;
      const source = writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));

            expectRealized(workspace, name);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
