import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleDemote, handleInstall, handleSkillsUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { unrecognizedOptions } from "../support/parser-probe.js";
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
  methods: ["example"],
  derivedFrom: [
    "cli/lockfile-rejections-name-recovery-routes",
    "cli/confirmation-flags-have-a-supported-purpose",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
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

/** The tokens of a rendered `axm …` command after the program name. */
const argvOf = (cmd: string): ReadonlyArray<string> => {
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
        expect(yield* unrecognizedOptions(argv)).toEqual([]);
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
        expect(yield* unrecognizedOptions(argv)).toEqual([]);
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
});
