import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  getAppError,
  handleInstall,
  handleSync,
  handleUpdate,
  handleWorkspaceUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/withheld-releases-name-recovery-from-the-emitting-command",
  title: "A withheld release names recovery from the command that withheld it",
  statement:
    "When a command withholds or refuses a release under the minimum release age, its diagnostic shall name the recovery routes reachable from that command, including the override flag that command accepts and the declared-exemption route, and shall not name a command the operator did not run.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "reviewer";
const FQN = `@acme/skills/${SKILL}`;
const OVERRIDE = "--ignore-release-age";
const EXEMPTION = "minimumReleaseAgeExclude";

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

/**
 * An accepted, aged 1.0.0 with an unaged 2.0.0 behind it: the command keeps
 * 1.0.0 and reports the release it withheld.
 */
const heldNewerRelease = (cleanups: Array<() => void>) =>
  Effect.gen(function* () {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill(SKILL, [{ version: "1.0.0", body: "First guidance." }]);
    const workspace = makeSpecWorkspace({
      screen: { kind: "human" },
      settings: { sources: [registry.source], skills: { [SKILL]: FQN } },
    });
    cleanups.push(workspace.cleanup);
    yield* handleInstall({
      source: Option.none(),
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer), Effect.orDie);
    registry.writeSkill(SKILL, [
      { version: "1.0.0", body: "First guidance." },
      { version: "2.0.0", body: "Newer guidance.", published: new Date().toISOString() },
    ]);
    workspace.streams?.log.splice(0);
    return workspace;
  });

/** A configured skill whose only release is unaged: the command refuses. */
const heldOnlyRelease = (cleanups: Array<() => void>) =>
  Effect.sync(() => {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill(SKILL, [
      { version: "1.0.0", body: "Fresh guidance.", published: new Date().toISOString() },
    ]);
    const workspace = makeSpecWorkspace({
      settings: { sources: [registry.source], skills: { [SKILL]: FQN } },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  });

/** Command forms that keep an eligible release and report the withheld one. */
const withholdingCommands: ReadonlyArray<{
  readonly command: string;
  readonly others: ReadonlyArray<string>;
  readonly run: (workspace: SpecWorkspace) => Effect.Effect<void, unknown>;
}> = [
  {
    command: "axm update",
    others: ["axm install", "axm sync", "axm skills update"],
    run: (workspace) =>
      handleUpdate({ source: Option.none(), yes: true, force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    command: "axm skills update",
    others: ["axm install", "axm sync"],
    run: (workspace) =>
      handleWorkspaceUpdate({
        command: "skills.update",
        type: Option.some("skill"),
        planName: "Update skills",
        planDescription: Option.some("Update configured skills"),
        flags: { yes: true, preview: false },
      }).pipe(Effect.provide(workspace.layer)),
  },
];

/** Command forms that refuse outright when the only release is withheld. */
const refusingCommands: ReadonlyArray<{
  readonly command: string;
  readonly run: (workspace: SpecWorkspace) => Effect.Effect<void, unknown>;
}> = [
  {
    command: "axm install",
    run: (workspace) =>
      handleInstall({ source: Option.none(), yes: true, force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    command: "axm sync",
    run: (workspace) => handleSync({ preview: false }).pipe(Effect.provide(workspace.layer)),
  },
];

const renderedText = (workspace: SpecWorkspace): string =>
  [...(workspace.streams?.lines("stdout") ?? []), ...(workspace.streams?.lines("stderr") ?? [])]
    .join("\n")
    .replaceAll(/\s+/gu, " ");

describe("A release withheld by the minimum release age", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(withholdingCommands)(
    "$command names its own override and the declared-exemption route",
    ({ command, others, run }) =>
      Effect.gen(function* () {
        const workspace = yield* heldNewerRelease(cleanups);

        yield* run(workspace);

        const rendered = renderedText(workspace);
        expect(rendered).toContain("minimum release age");
        expect(rendered).toContain(`${command} ${OVERRIDE}`);
        expect(rendered).toContain(EXEMPTION);
        for (const other of others) {
          expect(rendered).not.toContain(other);
        }
      }),
  );

  it.effect.each(refusingCommands)(
    "$command names both recovery routes when it refuses the only release",
    ({ run }) =>
      Effect.gen(function* () {
        const workspace = yield* heldOnlyRelease(cleanups);

        const failure = yield* run(workspace).pipe(Effect.flip);

        const error = getAppError(failure);
        expect(error.detail).toContain("minimum release age");
        const guidance = (error.suggestions ?? [])
          .map((suggestion) => `${suggestion.description} ${suggestion.cmd ?? ""}`)
          .join(" ");
        expect(guidance).toContain(EXEMPTION);
        expect(guidance).toContain(OVERRIDE);
        // The refusal speaks of "this command", so it can name no other.
        expect(guidance).not.toContain("axm ");
      }),
  );
});
