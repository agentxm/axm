import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { makeAppError } from "../app-error/index.js";
import { protectWorkspacePath, runWorkspaceTransaction } from "./transaction.js";

const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("runWorkspaceTransaction", () => {
  let tempDir: string;
  let workspaceDir: string;
  let settingsPath: string;
  let canonicalPath: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "workspace-transaction-test-"));
    workspaceDir = nodePath.join(tempDir, ".axm");
    settingsPath = nodePath.join(workspaceDir, "settings.json");
    canonicalPath = nodePath.join(workspaceDir, "extensions", "demo");
    nodeFs.mkdirSync(canonicalPath, { recursive: true });
    nodeFs.writeFileSync(settingsPath, '{"future":{"value":1}}\n');
    nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "before\n");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("restores every target when the transition fails", () =>
    withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.gen(function* () {
          yield* protectWorkspacePath(canonicalPath);
          yield* Effect.sync(() => {
            nodeFs.writeFileSync(settingsPath, '{"changed":true}\n');
            nodeFs.rmSync(canonicalPath, { recursive: true });
            nodeFs.mkdirSync(canonicalPath, { recursive: true });
            nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "after\n");
          });
          return yield* makeAppError({
            code: "internal",
            detail: "injected transition failure",
          });
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.detail).toBe("injected transition failure");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
            expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "content.txt"), "utf8")).toBe(
              "before\n",
            );
          }),
        ),
      ),
    ),
  );

  it.effect("restores every authoritative state family after an injected write failure", () => {
    const lockfilePath = nodePath.join(workspaceDir, "axm-lock.yaml");
    const canonicalFile = nodePath.join(canonicalPath, "content.txt");
    const projectionPath = nodePath.join(tempDir, ".claude", "skills", "demo", "SKILL.md");
    nodeFs.mkdirSync(nodePath.dirname(projectionPath), { recursive: true });
    nodeFs.writeFileSync(lockfilePath, "lockfileVersion: 4\nskills: {}\n");
    nodeFs.writeFileSync(projectionPath, "projected before\n");

    const families = [
      { family: "desired settings", target: settingsPath },
      { family: "observed canonical content", target: canonicalFile },
      { family: "managed projection", target: projectionPath },
      { family: "accepted lock state", target: lockfilePath },
    ] as const;

    return withContext(
      Effect.forEach(
        families,
        ({ family, target }) => {
          const before = nodeFs.readFileSync(target, "utf8");
          return runWorkspaceTransaction({
            workspaceDir,
            targets: [target],
            transition: Effect.sync(() => nodeFs.writeFileSync(target, `${family} changed\n`)).pipe(
              Effect.andThen(
                Effect.fail(makeAppError({ code: "internal", detail: `${family} failure` })),
              ),
            ),
            validate: () => Effect.void,
          }).pipe(
            Effect.flip,
            Effect.tap((error) =>
              Effect.sync(() => {
                expect(error.detail).toBe(`${family} failure`);
                expect(nodeFs.readFileSync(target, "utf8"), family).toBe(before);
              }),
            ),
          );
        },
        { discard: true },
      ),
    );
  });

  it.effect("removes targets that did not exist before a failed transition", () => {
    const createdPath = nodePath.join(workspaceDir, "created.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [createdPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(createdPath, "created\n")).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap(() => Effect.sync(() => expect(nodeFs.existsSync(createdPath)).toBe(false))),
      ),
    );
  });

  it.effect("removes the process-lock artifact after a failed first transition", () => {
    const absentWorkspaceDir = nodePath.join(tempDir, "new-workspace", ".axm");
    const createdPath = nodePath.join(absentWorkspaceDir, "settings.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir: absentWorkspaceDir,
        targets: [createdPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(createdPath, "created\n")).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap(() =>
          Effect.sync(() => {
            expect(nodeFs.readdirSync(absentWorkspaceDir)).toEqual([]);
          }),
        ),
      ),
    );
  });

  it.effect("rolls back when postcondition validation fails", () =>
    withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n')),
        validate: () =>
          Effect.fail(makeAppError({ code: "validation", detail: "postcondition invalid" })),
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.detail).toBe("postcondition invalid");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
          }),
        ),
      ),
    ),
  );

  it.effect("rolls back prior nested targets when a later nested target fails", () => {
    const laterTarget = nodePath.join(workspaceDir, "later.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.gen(function* () {
          yield* Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n'));
          yield* runWorkspaceTransaction({
            workspaceDir,
            targets: [canonicalPath],
            transition: Effect.sync(() =>
              nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "after\n"),
            ),
            validate: () => Effect.void,
          });
          return yield* runWorkspaceTransaction({
            workspaceDir,
            targets: [laterTarget],
            transition: Effect.sync(() => nodeFs.writeFileSync(laterTarget, "created\n")).pipe(
              Effect.andThen(
                Effect.fail(
                  makeAppError({ code: "internal", detail: "injected later-target failure" }),
                ),
              ),
            ),
            validate: () => Effect.void,
          });
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.detail).toBe("injected later-target failure");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
            expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "content.txt"), "utf8")).toBe(
              "before\n",
            );
            expect(nodeFs.existsSync(laterTarget)).toBe(false);
          }),
        ),
      ),
    );
  });

  it.effect("retains a usable backup path when exact rollback fails", () => {
    const parent = nodePath.dirname(settingsPath);
    const movedParent = `${parent}-moved`;
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.sync(() => {
          nodeFs.renameSync(parent, movedParent);
          nodeFs.writeFileSync(parent, "blocks rollback");
        }).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error.detail).toContain("Workspace recovery is required");
            const marker = "Recovery backup retained at: ";
            const backupPath = error.detail.slice(error.detail.indexOf(marker) + marker.length);
            expect(nodeFs.existsSync(backupPath.trim())).toBe(true);
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            nodeFs.rmSync(parent, { force: true });
            nodeFs.renameSync(movedParent, parent);
          }),
        ),
      ),
    );
  });

  it.effect("serializes concurrent transitions for one workspace", () =>
    withContext(
      Effect.gen(function* () {
        const active = yield* Ref.make(0);
        const maximum = yield* Ref.make(0);
        const transition = runWorkspaceTransaction({
          workspaceDir,
          targets: [settingsPath],
          transition: Effect.gen(function* () {
            const current = yield* Ref.updateAndGet(active, (value) => value + 1);
            yield* Ref.update(maximum, (value) => Math.max(value, current));
            yield* Effect.yieldNow;
            yield* Ref.update(active, (value) => value - 1);
          }),
          validate: () => Effect.void,
        });
        yield* Effect.all([transition, transition], { concurrency: "unbounded" });
        expect(yield* Ref.get(maximum)).toBe(1);
      }),
    ),
  );
});
