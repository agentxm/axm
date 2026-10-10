import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { parse } from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";
import { CreateExtension } from "../index.js";
import { createRequestFor } from "../test-support/create-requests.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/new/records-discovery-summary",
  title: "Every extension type records an optional discovery summary",
  statement:
    "Every type-specific new command shall accept one optional --description listing and search summary and record it in the authored manifest. Skills shall also record it in SKILL.md frontmatter. Omission shall preserve each type's existing scaffold description or absence.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const Summary = Schema.Struct({ description: Schema.String });
const description = 'Review: "quoted" guidance\nwith a second line';

describe("Creation discovery summary", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each([
    ["skill", "skill.json"],
    ["subagent", "subagent.json"],
    ["rule", "rule.json"],
    ["hook", "hook.json"],
    ["knowledge", "knowledge.json"],
    ["pack", "pack.json"],
    ["mcp-server", "mcp.json"],
  ] as const)("records the supplied summary for %s", ([type, manifest]) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        ...createRequestFor(type, "review"),
        description: Option.some(description),
      });
      yield* CreateExtension.previewOrApply(candidate, applyExecution);
      const metadata = Schema.decodeUnknownSync(Schema.fromJsonString(Summary))(
        workspace.read(`${candidate.authoredPath}/${manifest}`) ?? "null",
      );
      expect(metadata.description).toBe(description);
      if (type === "skill") {
        const body = workspace.read(candidate.entryPath) ?? "";
        const frontmatter = body.match(/^---\n([\s\S]*?)\n---/u)?.[1];
        expect(frontmatter).toBeDefined();
        const parsed: unknown = parse(frontmatter ?? "");
        expect(Schema.decodeUnknownSync(Summary)(parsed).description).toBe(description);
      }
    }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
  });
});
