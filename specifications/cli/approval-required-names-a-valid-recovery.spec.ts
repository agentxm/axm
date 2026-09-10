import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleDemote,
  handleInstall,
  handleSkillsUpdate,
  PlanResolutionDocumentSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { admitRecoveryArgv } from "../support/recovery-argv-admission.js";
import { makeDirectoryFixture } from "../support/directory-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";
import { makeSpecRegistry, type SpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/approval-required-names-a-valid-recovery",
  title: "A blocked approval names a recovery the command line will accept",
  statement:
    "When an apply stops as approval required, its recovery shall name the approval its route supports — a replay carrying the advance-approval flag where the route offers one, otherwise an interactive rerun without machine or non-interactive switches — the named command shall parse on the real command line, and a request whose values cannot be replayed safely shall describe the recovery without echoing those values.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI executes the emitted demote recovery and verifies the resulting workspace transition; complementary in-process cases admit full argument vectors with the registered parser while substituting only the target handler for interactive-only recovery.",
  methods: ["example", "contract"],
  derivedFrom: [
    "cli/lockfile-rejections-name-recovery-routes",
    "cli/confirmation-flags-have-a-supported-purpose",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These replays use inert values without shell quoting; the interactive-only recovery is parsed through its complete registered branch with an observing handler and does not establish terminal prompt behavior.",
      retirementCondition:
        "Add quoted recovery values and an interactive terminal replay through a supported process harness; existing confirmation specifications continue to own prompt behavior.",
    },
  ],
});

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;
const SECRET = "supersecrettoken";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The recovery the blocked resolution offers as its escape. */
const escapeOf = (data: unknown): { readonly description?: string; readonly cmd?: string } => {
  const result = isRecord(data) ? data["result"] : undefined;
  const blocking = isRecord(result) ? result["blocking"] : undefined;
  const escape = isRecord(blocking) ? blocking["escape"] : undefined;
  if (!isRecord(escape)) return {};
  return {
    ...(typeof escape["description"] === "string" ? { description: escape["description"] } : {}),
    ...(typeof escape["cmd"] === "string" ? { cmd: escape["cmd"] } : {}),
  };
};

/** These fixtures use unquoted tokens; replay never evaluates a shell command. */
const argvOf = (cmd: string): ReadonlyArray<string> => {
  expect(cmd).toMatch(/^[A-Za-z0-9_@%+=:,./^ -]+$/u);
  const [program, ...rest] = cmd.split(" ");
  expect(program).toBe("axm");
  return rest;
};

/** Republish the skill's Registry index under a different publisher binding. */
const republishUnderBinding = (registry: SpecRegistry, name: string, binding: string): void => {
  const indexPath = path.join(registry.root, "extensions", "@acme", "skills", name, "index.json");
  const index: unknown = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (!isRecord(index)) throw new Error(`Registry index for ${name} is not an object`);
  fs.writeFileSync(
    indexPath,
    `${JSON.stringify({ ...index, publisherBindingId: binding }, null, 2)}\n`,
  );
};

describe("Approval-required recovery", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const authoredWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { owner: "@acme", skills: { [SKILL]: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, { name: SKILL });
    const replacement = writeLocalSkillPackage(workspace.root, {
      name: SKILL,
      body: "Replacement guidance.",
    });
    return { workspace, replacement };
  };

  it.effect(
    "a route with advance approval names a replay carrying the flag that the parser accepts",
    () =>
      Effect.gen(function* () {
        const { workspace, replacement } = authoredWorkspace();

        yield* handleDemote({ fqn: FQN, source: replacement, yes: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: { outcome: "blocked", blocking: { class: "approval-required" } },
        });
        const escape = escapeOf(entry?.data);
        expect(escape.cmd).toBeDefined();
        const argv = argvOf(escape.cmd ?? "");
        expect(argv).toContain("--yes");
        expect(argv.slice(0, 1)).toEqual(["demote"]);
        expect(yield* admitRecoveryArgv(argv, ["demote"])).toMatchObject({
          fqn: FQN,
          source: replacement,
          yes: true,
        });
        const missingSource = argv.filter((token) => token !== replacement);
        expect(missingSource).toHaveLength(argv.length - 1);
        const refused = yield* admitRecoveryArgv(missingSource, ["demote"]).pipe(Effect.exit);
        expect(Exit.isFailure(refused)).toBe(true);
      }),
  );

  it.effect(
    "a route without advance approval names an interactive rerun that the parser accepts",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill(SKILL, [{ version: "1.0.0", body: "First guidance." }]);
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { nonInteractive: true, json: true },
          settings: { sources: [registry.source] },
        });
        cleanups.push(workspace.cleanup);
        yield* handleInstall({ source: Option.some(FQN), force: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        registry.writeSkill(SKILL, [
          { version: "2.0.0", body: "Second guidance." },
          { version: "1.0.0", body: "First guidance." },
        ]);
        republishUnderBinding(registry, SKILL, "hbnd_other");
        workspace.rendererState.results.splice(0);

        yield* handleSkillsUpdate({
          source: Option.none(),
          skills: [],
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "blocked",
            blocking: { class: "approval-required", subject: "publisher-ownership-change" },
          },
        });
        const escape = escapeOf(entry?.data);
        expect(escape.description).toContain("Approve interactively");
        expect(escape.cmd).toBeDefined();
        const argv = argvOf(escape.cmd ?? "");
        expect(argv.slice(0, 2)).toEqual(["skills", "update"]);
        expect(argv).not.toContain("--yes");
        expect(argv).not.toContain("--json");
        expect(argv).not.toContain("--non-interactive");
        yield* admitRecoveryArgv(argv, ["skills", "update"]);
        expect(workspace.readLockfileText()).toContain("publisherBindingId: hbnd_test");
      }),
  );

  it.effect(
    "a request carrying a protected value is described without a replay and without the value",
    () =>
      Effect.gen(function* () {
        const { workspace, replacement } = authoredWorkspace();
        // A credential-bearing locator resolves to the same local package but
        // must never be echoed back in a suggested command.
        const protectedSource = `file://${replacement}?token=${SECRET}`;

        yield* handleDemote({ fqn: FQN, source: protectedSource, yes: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: { outcome: "blocked", blocking: { class: "approval-required" } },
        });
        const escape = escapeOf(entry?.data);
        expect(escape.cmd).toBeUndefined();
        expect(escape.description).toContain("--yes");
        const rendered = JSON.stringify({
          document: entry?.data,
          suggestions: workspace.rendererState.suggestions,
        });
        expect(rendered).not.toContain(SECRET);
        expect(rendered).not.toContain("token=");
        expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: "workspace" } });
      }),
  );

  it("executes the emitted advance-approval replay through the built CLI and replaces only the selected authored package", async () => {
    const fixture = makeDirectoryFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.invoking, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
          minimumReleaseAge: "0s",
        }),
      );
      writeAuthoredSkill(fixture.invoking, {
        name: SKILL,
        description: "Previous authored guidance.",
      });
      const replacement = writeLocalSkillPackage(fixture.invoking, {
        name: SKILL,
        body: "Selected replacement guidance.",
      });
      fs.writeFileSync(
        path.join(fixture.invoking, "unrelated.txt"),
        "Unrelated workspace content.\n",
      );
      const sourceBefore = snapshotWorkspaceContent(replacement);
      const before = snapshotWorkspaceContent(fixture.invoking);
      const blocked = await fixture.run([
        "demote",
        FQN,
        "./vendor/review",
        "--json",
        "--non-interactive",
      ]);
      expect(blocked.exitCode, blocked.stdout + blocked.stderr).toBe(2);
      const blockedDocument = Schema.decodeUnknownSync(PlanResolutionDocumentSchema)(
        JSON.parse(blocked.stdout),
      );
      expect(blockedDocument.result).toMatchObject({
        outcome: "blocked",
        counts: { committed: 0 },
        blocking: { class: "approval-required", subject: "replace-workspace-authority" },
      });
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
      const recovery = blockedDocument.result.blocking?.escape?.cmd;
      if (recovery === undefined) throw new Error("Expected an emitted demote recovery command");
      const argv = argvOf(recovery);
      expect(argv[0]).toBe("demote");
      expect(argv).toContain("--yes");
      expect(argv).toContain(FQN);
      expect(argv).toContain("./vendor/review");
      const applied = await fixture.run(argv);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      const appliedDocument = Schema.decodeUnknownSync(PlanResolutionDocumentSchema)(
        JSON.parse(applied.stdout),
      );
      expect(appliedDocument.result.outcome).toBe("applied");
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({ skills: { review: "./vendor/review" } });
      expect(fs.existsSync(path.join(fixture.invoking, "skills/review"))).toBe(false);
      expect(
        snapshotWorkspaceContent(
          path.join(fixture.invoking, "agent_extensions/local/vendor/review"),
        ),
      ).toEqual(sourceBefore);
      expect(snapshotWorkspaceContent(replacement)).toEqual(sourceBefore);
      expect(fs.readFileSync(path.join(fixture.invoking, "unrelated.txt"), "utf8")).toBe(
        "Unrelated workspace content.\n",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
