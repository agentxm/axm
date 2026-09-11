import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
} from "../testing.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/records-direct-intent",
  title: "Install records the extension as directly desired workspace configuration",
  statement:
    "When a person installs an acquirable extension, the install shall record it in workspace settings as directly desired configuration.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [],
  openQuestions: [],
});

/** One row per extension type acquired from a local directory. */
const rows: ReadonlyArray<{
  readonly label: string;
  readonly type: InstallableExtensionType;
  readonly settingsKey: string;
  readonly writePackage: (root: string, fixture: { readonly name: string }) => string;
}> = [
  { label: "skill", type: "skill", settingsKey: "skills", writePackage: writeLocalSkillPackage },
  {
    label: "subagent",
    type: "subagent",
    settingsKey: "subagents",
    writePackage: writeLocalSubagentPackage,
  },
  { label: "rule", type: "rule", settingsKey: "rules", writePackage: writeLocalRulePackage },
  { label: "hook", type: "hook", settingsKey: "hooks", writePackage: writeLocalHookPackage },
  {
    label: "knowledge bundle",
    type: "knowledge",
    settingsKey: "knowledge",
    writePackage: writeLocalKnowledgePackage,
  },
];

describe("Install records direct workspace intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("records the extension as directly desired workspace configuration", () => {
    const { workspace } = world();
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    expect(JSON.stringify(readSettings(workspace))).not.toContain("code-review");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );

          expect(readSettings(workspace)).toMatchObject({
            skills: { "code-review": expect.anything() },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(rows)(
    "records direct intent for a local $label",
    ({ type, label, settingsKey, writePackage }) => {
      const { workspace } = world();
      const name = `conformance-${label.split(" ")[0] ?? label}`;
      const source = writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));

            expect(readSettings(workspace)).toMatchObject({
              [settingsKey]: { [name]: expect.anything() },
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
