import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { projectionOutputDigest } from "@agentxm/workspace-kernel/projection";
import { storedLockfileFixture } from "@agentxm/workspace-kernel/workspace-state/testing";

import { lintProject, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-modified-projections-and-unknown-fences",
  title: "Lint reports edited projections and AXM fences it does not manage",
  statement:
    "A workspace lint run shall report, as information, each recorded projection unit whose bytes differ from the output digest AXM last recorded for it, comparing a whole file directly and a region through its body only, naming the path, that AXM replaces it when its inputs change, and where to make the change instead; and shall report, as information, each AXM fence outside the region vocabulary in the canonical instruction file or .gitignore with its path and line, saying it is left untouched. Fences inside Markdown code blocks shall not be reported, and the run shall change no file.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Recorded rows are a real lockfile and the compared bytes are real files under a temporary workspace; production lint reads both without mutating either.",
  derivedFrom: [
    "workspace/projections/fences-are-name-only-and-top-level",
    "workspace/lockfile/records-projection-currency",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const MODIFIED = "workspace/projection-modified";
const UNKNOWN = "workspace/unknown-axm-fence";

const agentsMd = (rule: string, extra: string) =>
  `# Project\n\n<!-- axm:rules -->\n${rule}\n<!-- /axm:rules -->\n${extra}\n\`\`\`md\n<!-- axm:example -->\n\`\`\`\n`;
const UNKNOWN_BLOCK = "\n<!-- axm:future -->\nKept by hand.\n<!-- /axm:future -->\n";
const gitignore = (extra: string) =>
  `node_modules\n# axm:instruction-aliases\nCLAUDE.md\n# /axm:instruction-aliases\n${extra}`;

const lockfile = JSON.stringify(
  storedLockfileFixture({
    projections: {
      rules: {
        contract: 1,
        units: { "AGENTS.md": { output: projectionOutputDigest("Written rule.\n") } },
      },
      instructions: {
        contract: 1,
        units: {
          ".gitignore": { output: projectionOutputDigest("CLAUDE.md\n") },
          "CLAUDE.md": { output: projectionOutputDigest("# Copy\n") },
        },
      },
    },
  }),
);

describe("Modified projections and unknown fences", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports edited units and unknown fences until both are resolved", () => {
    const workspace = makeLintWorkspace({
      settings: {
        instructionFiles: { fileName: "AGENTS.md" },
        lint: { rules: { ...isolatedLintRules(MODIFIED, undefined), [UNKNOWN]: "info" } },
      },
      files: {
        "axm-lock.yaml": lockfile,
        "AGENTS.md": agentsMd("Edited rule.", UNKNOWN_BLOCK),
        "CLAUDE.md": "# Copy\n",
        ".gitignore": gitignore("# axm:legacy-notes\n"),
      },
    });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const before = workspace.snapshot();
      const { document } = yield* lintProject(workspace);
      expect(
        document.findings.map(({ ruleId, severity, message, location }) => ({
          ruleId,
          severity,
          message,
          file: location?.file,
          line: location?.line,
        })),
      ).toEqual([
        {
          ruleId: MODIFIED,
          severity: "info",
          message:
            "`AGENTS.md` differs from what AXM last wrote; AXM replaces it when its inputs change. Run `axm sync` to withdraw it.",
          file: "AGENTS.md",
          line: undefined,
        },
        {
          ruleId: UNKNOWN,
          severity: "info",
          message:
            "`AGENTS.md:7` has AXM fence `axm:future`, which is not a region AXM manages; it is left untouched.",
          file: "AGENTS.md",
          line: 7,
        },
        {
          ruleId: UNKNOWN,
          severity: "info",
          message:
            "`AGENTS.md:9` has AXM fence `/axm:future`, which is not a region AXM manages; it is left untouched.",
          file: "AGENTS.md",
          line: 9,
        },
        {
          ruleId: UNKNOWN,
          severity: "info",
          message:
            "`.gitignore:5` has AXM fence `axm:legacy-notes`, which is not a region AXM manages; it is left untouched.",
          file: ".gitignore",
          line: 5,
        },
      ]);
      expect(workspace.snapshot()).toEqual(before);

      // Prose outside the region is the person's; only the region body counts.
      workspace.writeFile("AGENTS.md", agentsMd("Written rule.", "\nMore prose by hand.\n"));
      workspace.writeFile(".gitignore", gitignore(""));
      const settled = yield* lintProject(workspace, { strict: true });
      expect(settled.document.findings).toEqual([]);
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
