import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/realizes-for-every-configured-agent",
  title: "Install realizes the extension for every configured agent",
  statement:
    "When an acquirable extension is installed, AXM shall realize it on every native surface supported for that extension type by the configured agents and on its declared shared surfaces, as permitted by the workspace's activation and instruction settings.",
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
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.",
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
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("realizes the extension for every configured agent", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ settings: { agents: ["claude-code", "cursor"] } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: SKILL });
      for (const location of REALIZED_LOCATIONS) {
        expect(workspace.exists(location), location).toBe(false);
      }

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      for (const location of REALIZED_LOCATIONS) {
        expect(workspace.readFile(`${location}/SKILL.md`), location).toBe(
          workspace.readFile(`vendor/${SKILL}/src/SKILL.md`),
        );
      }
    }),
  );
  it.effect.each(localLifecycleRows)(
    "realizes the applicable agent surfaces for a local $label",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace();
        cleanups.push(workspace.cleanup);
        const name = `conformance-${row.label}`;
        const source = row.writePackage(workspace.root, { name });
        yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        row.expectRealized(workspace, name);
      }),
  );
});
