import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as crypto from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withWorkspaceObservationReadView } from "@agentxm/workspace-kernel/workspace-state";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import { prepare, previewOrApply } from "../index.js";
import {
  makePublishWorld,
  makeRemotePublishWorld,
  remoteRequest,
  runPublish,
  publishDocument,
  publishFailureOf,
  requestFor,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/prepared-distribution-is-revalidated",
  title: "Prepared publication refuses changed bytes or file-selection policy",
  statement:
    "Before the first upload, even within an enclosing observation phase, publish shall rediscover its effective file-selection inputs and rebuild the selected distribution, refuse changed source bytes or policy with no upload, and publish the exact prepared archive when both remain unchanged.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Real filesystem edits distinguish policy rediscovery from rereading only previously observed files.",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("prepared distribution freshness", () => {
  for (const change of [
    "bytes",
    "manifest-policy",
    "new-ancestor",
    "edited-ancestor",
    "removed-ancestor",
    "new-nested",
    "standalone",
    "unchanged",
    "excluded-bytes",
  ] as const) {
    it.effect(change, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
        try {
          const packageRoot = world.write("skill", {
            name: "review",
            publishExclude: ["notes.txt", "**/.gitignore"],
          });
          const root = nodePath.dirname(nodePath.dirname(packageRoot));
          if (change !== "standalone") fs.mkdirSync(nodePath.join(root, ".git"));
          const policy = nodePath.join(root, ".gitignore");
          if (change === "edited-ancestor" || change === "removed-ancestor")
            fs.writeFileSync(policy, "missing-*\n");
          fs.writeFileSync(nodePath.join(packageRoot, "notes.txt"), "before");
          yield* world.provide(
            withWorkspaceObservationReadView(
              Effect.gen(function* () {
                const ready = yield* prepare(requestFor(world, { preview: false }));
                expect(ready._tag).toBe("Ready");
                if (ready._tag !== "Ready") throw new Error("Expected a prepared candidate");
                switch (change) {
                  case "manifest-policy": {
                    const file = nodePath.join(packageRoot, "skill.json");
                    fs.writeFileSync(
                      file,
                      fs.readFileSync(file, "utf8").replace("notes.txt", "other.txt"),
                    );
                    break;
                  }
                  case "bytes":
                    fs.appendFileSync(nodePath.join(packageRoot, "src", "SKILL.md"), "\nchanged\n");
                    break;
                  case "new-ancestor":
                    fs.writeFileSync(policy, "missing-*\n");
                    break;
                  case "edited-ancestor":
                    fs.writeFileSync(policy, "other-missing-*\n");
                    break;
                  case "removed-ancestor":
                    fs.unlinkSync(policy);
                    break;
                  case "new-nested":
                    fs.writeFileSync(
                      nodePath.join(packageRoot, "src", ".gitignore"),
                      "missing-*\n",
                    );
                    break;
                  case "standalone":
                    fs.writeFileSync(nodePath.join(packageRoot, ".gitignore"), "missing-*\n");
                    break;
                  case "excluded-bytes":
                    fs.writeFileSync(nodePath.join(packageRoot, "notes.txt"), "after");
                    break;
                  case "unchanged":
                    break;
                }
                const outcome = yield* previewOrApply(
                  ready.candidate,
                  applyPlanExecution({
                    approval: "preapproved",
                    acceptedPolicies: new Set(),
                    recovery: { command: [], arguments: [] },
                  }),
                );
                const document = publishDocument(outcome);
                if (change === "unchanged" || change === "excluded-bytes") {
                  expect(document.counts.published).toBe(1);
                  expect(new Uint8Array(world.archive("review"))).toEqual(
                    ready.candidate.uploadCandidates[0]?.archive.copyBytes(),
                  );
                } else {
                  expect(document.counts.published).toBe(0);
                  expect(publishFailureOf(outcome).detail).toContain("changed");
                  expect(world.target.storedFiles()).toEqual([]);
                }
              }),
            ),
          );
        } finally {
          world.cleanup();
        }
      }),
    );
  }
});

for (const changed of [true, false]) {
  it.effect(`source changed while authoritative preview is pending: ${changed}`, () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const world = makeRemotePublishWorld({
        settings: { skills: { review: "workspace" } },
        beforePreviewResponse: Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
        ),
      });
      try {
        const root = world.write("skill", { name: "review" });
        const pending = yield* world.provide(runPublish(remoteRequest())).pipe(Effect.forkScoped);
        yield* Deferred.await(entered);
        expect(world.uploads).toHaveLength(0);
        if (changed)
          fs.appendFileSync(
            nodePath.join(root, "src", "SKILL.md"),
            "\nChanged while authorization was pending.\n",
          );
        yield* Deferred.succeed(release, undefined);
        const outcome = yield* Fiber.join(pending);
        const document = publishDocument(outcome);
        if (changed) {
          expect(world.uploads).toHaveLength(0);
          expect(document.counts.published).toBe(0);
          expect(publishFailureOf(outcome).detail).toContain("changed");
        } else {
          expect(document.counts.published).toBe(1);
          expect(world.uploads).toHaveLength(1);
          const upload = world.uploads[0];
          if (upload?.body._tag !== "Uint8Array") throw new Error("Expected archive upload");
          expect(crypto.createHash("sha256").update(upload.body.body).digest("hex")).toBe(
            world.previewed().candidates[0]?.archiveSha256Hex,
          );
        }
      } finally {
        world.cleanup();
      }
    }).pipe(Effect.scoped),
  );
}
