import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../../lifecycle/install/test-helpers.js";
import { serveBareRepository } from "../../../lifecycle/testing.js";
import { deriveOperationOutcome } from "../../../transitions/planning/index.js";

export const specification = defineSpecification({
  requirement: "cli/install/shared-pack-members-need-one-source-authority",
  title: "Shared Pack members come from one source authority",
  statement:
    "When install resolves a Pack that declares a member another installed Pack already holds, it shall accept the Pack when both inherit the member from one source view — the same Registry endpoint, the same Git repository, ref, and subdirectory, or the same local directory — and shall refuse it, naming every conflicting declaration, when the authorities differ.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Each Pack is installed through the production install use case from a real local directory or a Git repository served by a throwaway daemon, so the held authority is read back from the lock the earlier install recorded rather than from an in-memory graph.",
  methods: ["example"],
  derivedFrom: ["cli/install/pack-source-switches-are-member-diffed"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface SourceViewLayout {
  /** Where a Pack named `name` lives under the view root. */
  readonly pack: (name: string) => string;
  /** Where a skill named `name` lives under the view root. */
  readonly skill: (name: string) => string;
}

/** The layout AXM documents for a source directory: `packs/<name>` and `skills/<name>`. */
const conventionalLayout: SourceViewLayout = {
  pack: (name) => nodePath.join("packs", name),
  skill: (name) => nodePath.join("skills", name),
};

/** A layout convention discovery also accepts, where a Pack's directory says nothing about its view root. */
const unconventionalLayout: SourceViewLayout = {
  pack: (name) => nodePath.join("tools", name),
  skill: (name) => nodePath.join("catalog", "skills", name),
};

const writeSkill = (directory: string, name: string): void => {
  fs.mkdirSync(nodePath.join(directory, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(directory, "skill.json"),
    `${JSON.stringify({
      owner: "@acme",
      type: "skill",
      name,
      version: "1.0.0",
      description: `The ${name} skill.`,
    })}\n`,
  );
  fs.writeFileSync(
    nodePath.join(directory, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n`,
  );
};

const writePack = (directory: string, name: string, members: ReadonlyArray<string>): void => {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    nodePath.join(directory, "pack.json"),
    `${JSON.stringify({
      owner: "@acme",
      type: "pack",
      name,
      version: "1.0.0",
      description: `The ${name} pack.`,
      dependencies: Object.fromEntries(
        members.map((member) => [`@acme/skills/${member}`, "^1.0.0"]),
      ),
    })}\n`,
  );
};

/** One source view: every named skill, and every Pack declaring its members by name alone. */
const writeSourceView = (
  root: string,
  layout: SourceViewLayout,
  packs: Readonly<Record<string, ReadonlyArray<string>>>,
): void => {
  const skills = new Set(Object.values(packs).flat());
  for (const skill of skills) writeSkill(nodePath.join(root, layout.skill(skill)), skill);
  for (const [name, members] of Object.entries(packs)) {
    writePack(nodePath.join(root, layout.pack(name)), name, members);
  }
};

const packRequest = (source: string, name: string) =>
  installRequest({ type: "pack", subject: { kind: "source", source }, names: [name] });

describe("Pack member source authority", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect(
    "accepts a second local Pack from the same directory and refuses one from another directory, naming every conflict",
    () => {
      const { workspace } = world();
      const sharedView = nodePath.join(workspace.root, "fixtures", "shared-source");
      const otherView = nodePath.join(workspace.root, "fixtures", "other-source");
      writeSourceView(sharedView, unconventionalLayout, {
        alpha: ["shared", "alpha-only"],
        beta: ["shared", "beta-only"],
      });
      writeSourceView(otherView, unconventionalLayout, { gamma: ["shared", "alpha-only"] });

      return workspace
        .provide(
          Effect.gen(function* () {
            const alpha = yield* applyInstall(packRequest(sharedView, "alpha"));
            expect(deriveOperationOutcome(alpha)).toBe("applied");

            // Same directory, same members: the second Pack shares them.
            const beta = yield* applyInstall(packRequest(sharedView, "beta"));
            expect(deriveOperationOutcome(beta)).toBe("applied");
            expect(beta.riskConditions ?? []).toEqual([]);
            const lockfile = workspace.readFile("axm-lock.yaml");
            expect(lockfile).toContain("alpha");
            expect(lockfile).toContain("beta");
            expect(lockfile).toContain("beta-only");

            // Another directory claims two members the shared view holds:
            // every conflict is named and nothing moves.
            const before = workspace.snapshot();
            const gamma = yield* applyInstall(packRequest(otherView, "gamma"));
            expect(deriveOperationOutcome(gamma)).toBe("blocked");
            const details = (gamma.riskConditions ?? []).map((condition) => condition.detail);
            expect(details).toHaveLength(2);
            for (const detail of details) {
              expect(detail).toContain("@acme/packs/gamma");
              expect(detail).toContain("path:fixtures/shared-source");
              expect(detail).toContain("path:fixtures/other-source");
            }
            expect(details.some((detail) => detail.includes("@acme/skills/shared"))).toBe(true);
            expect(details.some((detail) => detail.includes("@acme/skills/alpha-only"))).toBe(true);
            expect(gamma.units.filter((unit) => unit.state === "committed")).toEqual([]);
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "accepts a second Git Pack from the same repository and ref that shares a member",
    () =>
      Effect.gen(function* () {
        const { workspace } = world();
        const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-pack-authority-git-"));
        cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
        const source = nodePath.join(root, "source");
        writeSourceView(source, conventionalLayout, {
          alpha: ["shared", "alpha-only"],
          beta: ["shared", "beta-only"],
        });
        const git = (args: ReadonlyArray<string>): void => {
          execFileSync("git", args, { cwd: source, stdio: "ignore" });
        };
        git(["init", "--quiet", "--initial-branch=main"]);
        git(["config", "user.email", "test@example.com"]);
        git(["config", "user.name", "Test"]);
        git(["add", "."]);
        git(["commit", "--quiet", "-m", "fixture"]);
        const served = yield* Effect.promise(() =>
          serveBareRepository({ root, source, name: "toolkit" }),
        );
        cleanups.push(served.stop);

        yield* workspace.provide(
          Effect.gen(function* () {
            const alpha = yield* applyInstall(packRequest(served.url, "alpha"));
            expect(deriveOperationOutcome(alpha)).toBe("applied");

            const beta = yield* applyInstall(packRequest(served.url, "beta"));
            expect(deriveOperationOutcome(beta)).toBe("applied");
            expect(beta.riskConditions ?? []).toEqual([]);
            const lockfile = workspace.readFile("axm-lock.yaml");
            expect(lockfile).toContain("alpha");
            expect(lockfile).toContain("beta");
            expect(lockfile).toContain("beta-only");
          }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );
});
