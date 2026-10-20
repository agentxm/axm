import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { projectionOutputDigest } from "@agentxm/workspace-kernel/projection";

import { collectHelpFiles } from "../test-support/command-tree-test-helpers.js";
import { makeAgentMembershipFixture } from "../test-support/agent-membership-fixture.js";
import { probeFlag } from "../test-support/parser-probe.js";
import { handleSync } from "../root/sync/handler.js";
import { withProjectionOutputPosture } from "../runtime.js";
import { withCommandRoute } from "../test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/projection-overrides-reach-every-projecting-command",
  title: "Whole-file projection overrides reach every command that writes or deletes projections",
  statement:
    "Every command that can write a whole-file projection shall accept --replace-unrecorded and every command that can delete one shall accept --discard-modified; each flag shall carry one definition and reach the projection writers only from the command's own parsed value; a refusal of an unrecorded file shall name the same invocation with --replace-unrecorded; and without --discard-modified a recorded file modified since AXM last wrote it shall be retained and reported, while with it the file shall be deleted.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["contract", "decision-table", "static", "example"],
  derivedFrom: [
    "cli/force-bypasses-only-named-policies",
    "workspace/subagents/native-locations-respect-shape-and-proof",
  ],
  supersedes: [],
  assumptions: [
    "Commands that reach projection writers only through a confirmation they do not own (authoring, forking, demotion, pack membership edits, migration) keep both policies and offer neither flag; their refusals name no flag.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The overrides are exercised through `axm sync`; the other registered routes reach the same posture through `withProjectionOutputPosture`, which the static checks below cover for every call site.",
      retirementCondition:
        "The specification harness exports a driver for every projecting command path, letting the decision table run per path.",
    },
  ],
});

const TYPES = ["hooks", "knowledge", "mcps", "packs", "rules", "skills", "subagents"] as const;

/** Commands that can write a whole-file projection, including first-use setup. */
const REPLACING_ROUTES = [
  "agents add",
  "enable",
  "install",
  "instructions enable",
  "setup",
  "sync",
  "update",
  ...TYPES.flatMap((type) => [`${type} enable`, `${type} install`, `${type} update`]),
].map((route) => `axm ${route}`);

/** Commands that can delete a whole-file projection. */
const DISCARDING_ROUTES = [
  "agents remove",
  "disable",
  "instructions disable",
  "instructions enable",
  "sync",
  "uninstall",
  "update",
  ...TYPES.flatMap((type) => [`${type} disable`, `${type} uninstall`, `${type} update`]),
].map((route) => `axm ${route}`);

const registeredRoutes = (flag: string) =>
  Effect.map(collectHelpFiles(), (helpFiles) =>
    [...helpFiles]
      .filter(([, doc]) => doc.flags.some((candidate) => `--${candidate.name}` === flag))
      .map(([commandPath]) => commandPath)
      .sort(),
  );

/** Every `withProjectionOutputPosture` argument in production CLI source. */
const postureArguments = (): ReadonlyArray<readonly [string, string]> => {
  const sourceRoot = path.resolve(import.meta.dirname, "..");
  const sites: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.name.endsWith(".ts") || /\.(test|spec)\./u.test(entry.name)) continue;
      const source = fs.readFileSync(entryPath, "utf8");
      for (const match of source.matchAll(/withProjectionOutputPosture\(\{([^}]*)\}\)/gu))
        sites.push([path.relative(sourceRoot, entryPath), (match[1] ?? "").trim()]);
    }
  };
  walk(sourceRoot);
  return sites;
};

const PLANNER_MANIFEST = JSON.stringify({
  owner: "@acme",
  type: "subagent",
  name: "planner",
  version: "1.0.0",
  description: "Plans work",
  core: { instructions: "src/planner.md" },
});

describe("Whole-file projection overrides", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixture = (options: Parameters<typeof makeAgentMembershipFixture>[0]) => {
    const made = makeAgentMembershipFixture({ machine: true, ...options });
    cleanups.push(made.cleanup);
    return made;
  };

  it.effect("are registered on exactly the commands that write or delete projections", () =>
    Effect.gen(function* () {
      expect(yield* registeredRoutes("--replace-unrecorded")).toEqual([...REPLACING_ROUTES].sort());
      expect(yield* registeredRoutes("--discard-modified")).toEqual([...DISCARDING_ROUTES].sort());
    }),
  );

  it.effect("carry one definition everywhere they are registered", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      for (const flag of ["replace-unrecorded", "discard-modified"]) {
        const descriptions = new Set(
          [...helpFiles.values()].flatMap((doc) =>
            doc.flags
              .filter((candidate) => candidate.name === flag)
              .map((candidate) => Option.getOrElse(candidate.description, () => "")),
          ),
        );
        expect(descriptions.size, flag).toBe(1);
      }
    }),
  );

  it("reach the writers only from each command's parsed flags", () => {
    const sites = postureArguments();
    expect(sites.length).toBeGreaterThan(0);
    const fields = sites.flatMap(([file, argument]) =>
      argument
        .split(",")
        .map((field) => field.trim())
        .filter((field) => field.length > 0)
        .map((field) => [file, field] as const),
    );
    const decided = fields.filter(
      ([, field]) => !/^(?:replaceUnrecorded|discardModified)(?::\s*[\w.]+)?$/u.test(field),
    );
    expect(decided).toEqual([]);
    const literal = fields.filter(([, field]) => /:\s*(?:true|false)$/u.test(field));
    expect(literal).toEqual([]);
  });

  it.effect("are accepted by the parser on every command that registers them", () =>
    Effect.gen(function* () {
      const unrecognized: Array<string> = [];
      for (const [flag, routes] of [
        ["--replace-unrecorded", REPLACING_ROUTES],
        ["--discard-modified", DISCARDING_ROUTES],
      ] as const)
        for (const route of routes) {
          const args = route
            .replace(/^axm ?/u, "")
            .split(" ")
            .filter(Boolean);
          if ((yield* probeFlag(args, flag)) === "unrecognized")
            unrecognized.push(`${route} ${flag}`);
        }
      expect(unrecognized).toEqual([]);
    }),
  );

  const unrecordedSubagent = () =>
    fixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        subagents: { planner: { source: "workspace", enabled: true } },
      },
      files: {
        "subagents/planner/subagent.json": PLANNER_MANIFEST,
        "subagents/planner/src/planner.md": "Plan carefully\n",
        ".claude/agents/planner.md": "# Written by hand\n",
      },
    });

  it.effect(
    "refuse an unrecorded file and name the same invocation with --replace-unrecorded",
    () =>
      Effect.gen(function* () {
        const workspace = unrecordedSubagent();
        const outcome = yield* workspace
          .provide(handleSync({ preview: false }))
          .pipe(
            withProjectionOutputPosture({ replaceUnrecorded: false }),
            withCommandRoute("sync"),
            Effect.result,
          );

        expect(workspace.readFile(".claude/agents/planner.md")).toBe("# Written by hand\n");
        expect(workspace.readLockfileText()).not.toContain(".claude/agents/planner.md");
        const reported = JSON.stringify([
          outcome,
          workspace.rendererState.results,
          workspace.rendererState.suggestions,
        ]);
        expect(reported).toContain("projection-output-unrecorded");
        expect(reported).toMatch(/"cmd":"axm sync[^"]*--replace-unrecorded"/u);
      }),
    40_000,
  );

  it.effect(
    "replace an unrecorded file and record it when the command carries --replace-unrecorded",
    () =>
      Effect.gen(function* () {
        const workspace = unrecordedSubagent();
        yield* workspace
          .provide(handleSync({ preview: false }))
          .pipe(withProjectionOutputPosture({ replaceUnrecorded: true }));

        expect(workspace.readFile(".claude/agents/planner.md")).toContain("Plan carefully");
        expect(workspace.readLockfileText()).toContain(".claude/agents/planner.md");
      }),
    40_000,
  );

  const PROJECTED = ".claude/agents/planner.md";
  const RECORDED = "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n";
  const EDITED = `${RECORDED}Local note.\n`;

  /** A disabled Subagent whose recorded projected file sync withdraws. */
  const disabledSubagent = (bytes: string) =>
    fixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        subagents: { planner: { source: "workspace", enabled: false } },
      },
      lockfile: {
        projections: {
          subagents: {
            contract: 1,
            units: { [PROJECTED]: { output: projectionOutputDigest(RECORDED) } },
          },
        },
      },
      files: {
        "subagents/planner/subagent.json": PLANNER_MANIFEST,
        "subagents/planner/src/planner.md": "Plan carefully\n",
        [PROJECTED]: bytes,
      },
    });

  it.effect.each([
    { case: "unedited recorded file", bytes: RECORDED, discard: false, kept: false },
    { case: "edited recorded file", bytes: EDITED, discard: false, kept: true },
    {
      case: "edited recorded file with --discard-modified",
      bytes: EDITED,
      discard: true,
      kept: false,
    },
  ])(
    "decide withdrawal of an $case",
    (row) =>
      Effect.gen(function* () {
        const workspace = disabledSubagent(row.bytes);

        yield* workspace
          .provide(handleSync({ preview: false }))
          .pipe(withProjectionOutputPosture({ discardModified: row.discard }));

        expect(workspace.exists(PROJECTED)).toBe(row.kept);
        if (row.kept) expect(workspace.readFile(PROJECTED)).toBe(row.bytes);
        // The row is withdrawn whatever the decision: a kept file is the person's now.
        expect(workspace.readLockfileText()).not.toContain(PROJECTED);
        if (row.kept)
          expect(JSON.stringify(workspace.rendererState.results)).toContain("--discard-modified");
      }),
    40_000,
  );
});
