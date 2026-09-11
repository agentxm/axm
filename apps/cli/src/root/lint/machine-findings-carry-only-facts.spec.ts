import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { LintJsonFindingSchema } from "@agentxm/workspace-lint";
import {
  CLAUDE_CODE_SKILLS_DIR,
  makeOfficialAxmSkillWorkspace,
} from "@agentxm/workspace-lint/testing";
import { NoProjectionParticipants } from "@agentxm/workspace-projection/testing";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer } from "../../test-support/presenter-test.js";
import { handleLint } from "./handler.js";

export const specification = defineSpecification({
  requirement: "cli/lint/machine-findings-carry-only-facts",
  title: "Machine lint output carries facts and no advice",
  statement:
    "When lint runs in machine output mode, each reported finding shall carry only fact fields, and the run shall emit no advisory or suggestion content on any channel.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "Machine output mode and its channels are adapter concepts, so the lint adapter over a captured Screen is the lowest layer that exercises both clauses; no process is needed to observe what it emitted.",
  methods: ["contract"],
  derivedFrom: ["cli/lint/findings-name-the-violated-invariant"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * The complete fact vocabulary a machine finding may carry. It is the key set
 * the feature's own finding schema declares: advice is not among them.
 */
const FACT_FIELDS = new Set(Object.keys(LintJsonFindingSchema.fields));

/** A lint run reads no Registry, so a transport that refuses proves it. */
const OfflineHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("A lint run must not reach the network."),
          description: "Offline test transport",
        }),
      }),
    ),
  ),
);

const rawFindings = (payload: unknown): ReadonlyArray<Record<string, unknown>> => {
  if (typeof payload !== "object" || payload === null) return [];
  const result: unknown = Reflect.get(payload, "result");
  if (typeof result !== "object" || result === null) return [];
  const findings: unknown = Reflect.get(result, "findings");
  if (!Array.isArray(findings)) return [];
  return findings.flatMap((finding: unknown) =>
    typeof finding === "object" && finding !== null && !Array.isArray(finding)
      ? [Object.fromEntries(Object.entries(finding))]
      : [],
  );
};

describe("Machine lint output", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("carries only fact fields on each finding and no suggestion output", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    // One deterministic violation, so the run has a finding to report.
    workspace.remove(`${CLAUDE_CODE_SKILLS_DIR}/axm`);
    const renderer = TestMachineRenderer.make();

    return Effect.gen(function* () {
      const suggestionsBefore = renderer.state.suggestions.length;
      const notesBefore = renderer.state.notes.length;

      yield* Effect.exit(
        handleLint({
          selection: {
            workspaceRoot: workspace.root,
            userHome: workspace.root,
            scope: "project",
            input: { view: "workspace" },
            fix: false,
          },
          strict: false,
          details: false,
        }),
      );

      const entry = renderer.state.results.at(-1);
      expect(entry?.ok).toBe(false);
      const findings = rawFindings(entry?.data);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      for (const finding of findings) {
        for (const key of Object.keys(finding)) {
          expect(FACT_FIELDS.has(key), `finding field '${key}' is a fact field`).toBe(true);
        }
      }
      // Machine mode emits no advice on any channel: neither the stdout
      // envelope's suggestions nor a note on the diagnostic stream.
      expect(renderer.state.suggestions.length).toBe(suggestionsBefore);
      expect(renderer.state.notes.length).toBe(notesBefore);
      expect(renderer.state.docs).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          workspace.layer,
          renderer.layer,
          TestFlagsLayer({ nonInteractive: true, json: true }),
        ).pipe(
          Layer.provideMerge(
            Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
          ),
        ),
      ),
    );
  });
});
