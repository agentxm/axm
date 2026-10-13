import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { LOCKFILE_VERSION } from "@agentxm/workspace-kernel/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";
import { ProjectionOutputPosture } from "@agentxm/workspace-kernel/projection";

import { makeSetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/rerun-preserves-existing-configuration",
  title: "Repeated setup preserves the existing workspace",
  statement:
    "When setup runs against an initialized workspace, AXM shall preserve its settings, lockfile, authored content, and agent outputs even if different agents are supplied, directing membership changes to the agent commands, except that it shall settle an instruction-management choice the project workspace has never recorded: asking where a prompt can open, applying the documented default under preapproval, and otherwise leaving the choice open. Settling that choice shall block, with a recovery, on a differing alias AXM has no record of writing rather than silently preserving it, and shall refuse a lockfile version this CLI does not read before writing anything.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/setup/initializes-selected-workspace"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeated setup", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("does not turn rerun options into a membership change", () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);
    const request = (agents: ReadonlyArray<string>) => ({
      scope: "project" as const,
      scopeExplicit: true,
      agents,
      yes: true,
      nonInteractive: true,
      projectRoot: decodeAbsolutePathSync(fixture.root),
      telemetryEnabled: false,
    });

    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(request(["claude-code"]));
          fixture.writeFile("notes.md", "Authored notes");
          const before = fixture.snapshot();

          const rerun = yield* runSetup(request(["cursor"]));

          expect(fixture.snapshot()).toEqual(before);
          expect(rerun).toMatchObject({
            outcome: {
              status: "already-initialized",
              changed: false,
              message: expect.stringContaining("axm agents add"),
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /** A workspace as an unattended first install leaves it: no instruction choice recorded. */
  const undecided = () => {
    const fixture = makeSetupFixture({
      files: {
        "axm.json": JSON.stringify({ agents: ["claude-code"], skills: {} }),
        "axm-lock.yaml": "lockfileVersion: 12\npackages: {}\nskills: {}\n",
        "CLAUDE.md": "# Team instructions\n",
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };
  const completion = (root: string, overrides: { yes?: boolean; nonInteractive: boolean }) => ({
    scope: "project" as const,
    scopeExplicit: true,
    agents: ["cursor"],
    ...overrides,
    projectRoot: decodeAbsolutePathSync(root),
    telemetryEnabled: false,
  });

  it.effect("settles an unrecorded instruction choice under preapproval", () => {
    const fixture = undecided();
    return fixture
      .provide(
        Effect.gen(function* () {
          const rerun = yield* runSetup(
            completion(fixture.root, { yes: true, nonInteractive: true }),
          );

          const settings: unknown = JSON.parse(fixture.readFile("axm.json"));
          expect(settings).toMatchObject({
            agents: ["claude-code"],
            instructionFiles: { fileName: "AGENTS.md" },
          });
          expect(settings).not.toHaveProperty("skills.axm");
          expect(fixture.readFile("AGENTS.md")).toBe("# Team instructions\n");
          expect(rerun).toMatchObject({
            outcome: { status: "initialized", changed: true, defaultSkillInstalled: false },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("leaves the choice open where nobody can answer or approve", () => {
    const fixture = undecided();
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();

          const rerun = yield* runSetup(completion(fixture.root, { nonInteractive: true }));

          expect(fixture.snapshot()).toEqual(before);
          expect(rerun).toMatchObject({
            outcome: { status: "already-initialized", changed: false },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("records a declined choice so setup does not ask again", () => {
    const fixture = makeSetupFixture({
      files: {
        "axm.json": JSON.stringify({ agents: ["claude-code"], skills: {} }),
        "axm-lock.yaml": "lockfileVersion: 12\npackages: {}\nskills: {}\n",
        "CLAUDE.md": "# Team instructions\n",
      },
      confirmInstructionSync: false,
    });
    cleanups.push(fixture.cleanup);
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(completion(fixture.root, { nonInteractive: false }));

          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            agents: ["claude-code"],
            instructionFiles: false,
          });
          expect(fixture.exists("AGENTS.md")).toBe(false);
          const before = fixture.snapshot();

          const again = yield* runSetup(completion(fixture.root, { nonInteractive: false }));

          expect(fixture.snapshot()).toEqual(before);
          expect(again).toMatchObject({ outcome: { status: "already-initialized" } });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /** An undecided workspace whose canonical file and a differing alias both exist. */
  const divergentAlias = (lockfileVersion = LOCKFILE_VERSION) => {
    const fixture = makeSetupFixture({
      files: {
        "axm.json": JSON.stringify({ agents: ["claude-code"], skills: {} }),
        "axm-lock.yaml": `lockfileVersion: ${lockfileVersion}\npackages: {}\nskills: {}\n`,
        "AGENTS.md": "# Canonical instructions\n",
        "CLAUDE.md": "# Different notes AXM never wrote\n",
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("blocks a differing unrecorded alias with a recovery instead of preserving it", () => {
    const fixture = divergentAlias();
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();

          // `axm setup` offers the override without setting it.
          const result = yield* Effect.result(
            runSetup(completion(fixture.root, { yes: true, nonInteractive: true })).pipe(
              Effect.provideService(ProjectionOutputPosture, { replaceUnrecorded: false }),
            ),
          );

          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure")
            expect(JSON.stringify(result.failure)).toContain("--replace-unrecorded");
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("replaces a differing unrecorded alias only on explicit intent", () => {
    const fixture = divergentAlias();
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* runSetup(completion(fixture.root, { yes: true, nonInteractive: true })).pipe(
            Effect.provideService(ProjectionOutputPosture, { replaceUnrecorded: true }),
          );

          expect(fs.readlinkSync(path.join(fixture.root, "CLAUDE.md"))).toBe("AGENTS.md");
          expect(fixture.readFile("AGENTS.md")).toBe("# Canonical instructions\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("refuses a newer lockfile before writing anything", () => {
    const fixture = divergentAlias(LOCKFILE_VERSION + 1);
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();

          const result = yield* Effect.result(
            runSetup(completion(fixture.root, { yes: true, nonInteractive: true })),
          );

          expect(result._tag).toBe("Failure");
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
