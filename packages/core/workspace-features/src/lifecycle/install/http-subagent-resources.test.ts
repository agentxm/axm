import * as fs from "node:fs";
import * as path from "node:path";
import { zipSync } from "fflate";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { parseNativeSubagent } from "@agentxm/extension-content";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
} from "../../testing/install-world.js";
import { applySyncAcceptingExecutionChanges } from "../../testing/sync-fixture.js";
import { makeLifecycleFixture } from "../testing.js";

describe("HTTP Subagent resources", () => {
  it.effect(
    "keeps bound resources usable after extraction cleanup, offline projection repair and accepted archive replay",
    () =>
      Effect.gen(function* () {
        const url = "https://packages.example.test/reviewers.zip";
        const instructions = "Review the complete change against the project conventions.\n";
        const encode = (value: string) => new TextEncoder().encode(value);
        const archive = zipSync({
          "collection/reviewer/subagent.json": encode(
            JSON.stringify({
              owner: "@acme",
              type: "subagent",
              name: "reviewer",
              version: "1.0.0",
              implementations: {
                codex: { kind: "native", source: "native/reviewer.toml" },
                opencode: { kind: "native", source: "native/reviewer.md" },
              },
            }),
          ),
          "collection/reviewer/native/reviewer.toml": encode(
            'name = "investigator"\ndescription = "Review"\ndeveloper_instructions = "Review."\nmodel_instructions_file = "../prompts/review.md"\n',
          ),
          "collection/reviewer/native/reviewer.md": encode(
            '---\ndescription: Review\nprompt: "{file:../prompts/review.md}"\n---\n',
          ),
          "collection/reviewer/prompts/review.md": encode(instructions),
        });
        const requests: string[] = [];
        let online = true;
        const client = HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request.url);
            return HttpClientResponse.fromWeb(
              request,
              online && request.url === url
                ? new Response(archive)
                : new Response(null, { status: 404 }),
            );
          }),
        );
        const workspace = yield* Effect.acquireRelease(
          Effect.sync(() =>
            makeLifecycleFixture({
              sources: "live",
              settings: { agents: ["codex", "opencode"] },
              httpClient: Layer.succeed(HttpClient.HttpClient, client),
            }),
          ),
          (workspace) => Effect.sync(workspace.cleanup),
        );
        const filesystem = yield* FileSystem.FileSystem;
        const temporaryRoots: string[] = [];
        const observedFilesystem = {
          ...filesystem,
          makeTempDirectory: (options: Parameters<typeof filesystem.makeTempDirectory>[0]) =>
            filesystem.makeTempDirectory(options).pipe(
              Effect.tap((directory) =>
                Effect.sync(() => {
                  temporaryRoots.push(directory);
                }),
              ),
            ),
        } satisfies FileSystem.FileSystem;
        // Close each invocation's acquisition scope before inspecting retained files.
        const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          workspace
            .provide(effect)
            .pipe(Effect.scoped, Effect.provideService(FileSystem.FileSystem, observedFilesystem));
        const expectExtractionReleased = () => {
          expect(temporaryRoots.length).toBeGreaterThan(0);
          for (const directory of temporaryRoots)
            expect(fs.existsSync(directory), directory).toBe(false);
          temporaryRoots.length = 0;
        };
        const codex = ".codex/agents/investigator.toml";
        const opencode = ".opencode/agents/reviewer.md";
        const readResourcePath = () =>
          Effect.gen(function* () {
            const definition = yield* parseNativeSubagent({
              agentId: "codex",
              source: "investigator.toml",
              content: workspace.readFile(codex),
            });
            const reference = definition.configuration["model_instructions_file"];
            if (typeof reference !== "string") throw new Error("Expected a bound instruction file");
            expect(path.relative(workspace.workspaceRoot, reference).split(path.sep)[0]).toBe(
              "agent_extensions",
            );
            expect(fs.readFileSync(reference, "utf8")).toBe(instructions);
            expect(workspace.readFile(opencode)).toContain(`---\n${instructions.trim()}`);
            expect(workspace.readFile(opencode)).not.toContain("{file:");
            return reference;
          });
        const installed = yield* provide(
          applyInstallAcceptingExecutionChanges(
            installRequest({
              type: "subagent",
              subject: { kind: "source", source: url },
              names: ["reviewer"],
            }),
          ),
        );
        expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
        expectExtractionReleased();
        const resource = yield* readResourcePath();
        const retained = path.dirname(path.dirname(resource));
        const lock = workspace.readFile("axm.lock");
        const removeNativeOutputs = () => {
          fs.rmSync(path.join(workspace.workspaceRoot, codex));
          fs.rmSync(path.join(workspace.workspaceRoot, opencode));
        };
        const expectRestored = (
          result: Effect.Success<ReturnType<typeof applySyncAcceptingExecutionChanges>>,
        ) => {
          expect(result._tag).toBe("Resolved");
          if (result._tag === "Resolved")
            expect(deriveOperationOutcome(result.resolution), JSON.stringify(result)).toBe(
              "applied",
            );
          expect(workspace.readFile("axm.lock")).toBe(lock);
        };

        // Existing retained content repairs native files with no source access.
        online = false;
        requests.length = 0;
        removeNativeOutputs();
        expectRestored(yield* provide(applySyncAcceptingExecutionChanges()));
        expect(requests).toEqual([]);
        expect(yield* readResourcePath()).toBe(resource);

        // Missing content replays the accepted archive into the same retained root.
        online = true;
        temporaryRoots.length = 0;
        removeNativeOutputs();
        fs.rmSync(retained, { recursive: true });
        expectRestored(yield* provide(applySyncAcceptingExecutionChanges()));
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((requested) => requested === url)).toBe(true);
        expectExtractionReleased();
        expect(yield* readResourcePath()).toBe(resource);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    90_000,
  );
});
