import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { applyUpdate, targetedUpdateRequest } from "../update/test-helpers.js";
import {
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberBody,
  sharedMemberOutsidePinFact,
  sharedMemberSettings,
} from "../../desired-state/workspace/test-helpers.js";
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
    "When a person installs an acquirable extension, the install shall record it in workspace settings as directly desired configuration; when a configured Pack's accepted member resolution no longer satisfies that member's effective constraint, the install shall change nothing and report the mismatch with every contributor, in the words sync states that fact, and the update route that accepts a satisfying resolution.",
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

  it.effect(
    "keeps a direct pin on a member the configured Packs also require, and realizes that pin",
    () => {
      const created = makeInstallWorld({
        settings: sharedMemberSettings(SHARED_MEMBER_PIN.inside),
      });
      cleanups.push(created.cleanup);
      const { workspace, registry } = created;
      publishSharedMemberScenario(registry);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ subject: { kind: "configured" } }));

            // The direct declaration keeps the pin the person recorded, and the
            // member both Packs require is realized at the version all admit.
            expect(readSettings(workspace)["skills"]).toEqual({
              [SHARED_MEMBER.name]: expect.stringContaining(
                `${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`,
              ),
            });
            expect(workspace.readFile("axm-lock.yaml")).toContain(
              `version: ${SHARED_MEMBER_PIN.inside}`,
            );
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("version: 1.2.0");
            expect(workspace.readFile(`.claude/skills/${SHARED_MEMBER.name}/SKILL.md`)).toContain(
              sharedMemberBody(SHARED_MEMBER_PIN.inside),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "refuses to replay an accepted Pack member a later direct pin excludes, naming the update route",
    () => {
      const created = makeInstallWorld({
        settings: {
          packs: Object.fromEntries(SHARED_MEMBER_PACKS.map((pack) => [pack.name, pack.fqn])),
        },
      });
      cleanups.push(created.cleanup);
      const { workspace, registry } = created;
      publishSharedMemberScenario(registry);
      return workspace
        .provide(
          Effect.gen(function* () {
            // Both Packs accept the newest member version they admit, then the
            // person pins the member directly to an older one.
            yield* applyInstall(installRequest({ subject: { kind: "configured" } }));
            expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.2.0");
            workspace.writeFile(
              "axm.json",
              `${JSON.stringify(
                {
                  ...readSettings(workspace),
                  // The form install records, so only the declaration is new.
                  skills: {
                    [SHARED_MEMBER.name]: `${registry.source.name}:${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`,
                  },
                },
                null,
                2,
              )}\n`,
            );
            const before = workspace.snapshot();

            const refused = yield* applyInstall(
              installRequest({ subject: { kind: "configured" } }),
            );

            // Replaying the accepted member would break the pin, and replay never
            // selects: the install changes nothing and names the decision.
            expect(deriveOperationOutcome(refused)).toBe("blocked");
            expect(workspace.snapshot()).toEqual(before);
            // Every contributor, in the words sync states the same fact.
            const mismatch = refused.units.find((unit) => unit.state === "blocked")?.message;
            expect(mismatch).toBe(
              sharedMemberOutsidePinFact({
                registry: registry.source.name,
                pin: SHARED_MEMBER_PIN.inside,
                acceptedVersion: "1.2.0",
              }),
            );
            expect(refused.suggestions).toContainEqual({
              description: "Explicitly update the extension to accept a satisfying resolution.",
              cmd: `axm update ${SHARED_MEMBER.fqn}`,
            });

            // The named route accepts the pinned version, after which the
            // configured Packs replay it.
            yield* applyUpdate(targetedUpdateRequest({ source: SHARED_MEMBER.fqn }));
            expect(workspace.readFile("axm-lock.yaml")).toContain(
              `version: ${SHARED_MEMBER_PIN.inside}`,
            );
            const replayed = yield* applyInstall(
              installRequest({ subject: { kind: "configured" } }),
            );
            expect(deriveOperationOutcome(replayed)).not.toBe("blocked");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

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
