import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { onTestFinished, vi } from "vitest";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";

import { makeSpecWorkspace } from "./install-harness.js";

it.effect("captures a fixture-owned user home instead of ambient developer state", () =>
  Effect.gen(function* () {
    const externalHome = fs.mkdtempSync(path.join(os.tmpdir(), "axm-external-home-"));
    onTestFinished(() => fs.rmSync(externalHome, { recursive: true, force: true }));
    vi.stubEnv("AXM_USER_HOME", externalHome);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const fixture = makeSpecWorkspace();
    onTestFinished(fixture.cleanup);

    const location = yield* WorkspaceLocation.pipe(fixture.provide);
    expect(location.userHome).not.toBe(externalHome);
    expect(fs.existsSync(location.userHome)).toBe(true);
    const capturedHome = location.userHome;
    fixture.cleanup();
    expect(fs.existsSync(capturedHome)).toBe(false);
    expect(fs.existsSync(externalHome)).toBe(true);
  }),
);

it.effect(
  "owns isolated real disk coordinators and preserves explicitly shared fixture admission",
  () => {
    const owner = makeSpecWorkspace();
    const related = makeSpecWorkspace({ boundaryClaimsDirectory: owner.boundaryClaimsDirectory });
    const unrelated = makeSpecWorkspace();
    const write = (world: typeof owner) =>
      world.provide(
        runWorkspaceTransaction({
          targets: [path.join(world.root, "output.txt")],
          transition: Effect.sync(() => {
            const directory = world.boundaryClaimsDirectory;
            if (directory === undefined) throw new Error("Disk fixture must own a coordinator");
            expect(fs.existsSync(path.join(directory, "active.json"))).toBe(true);
            fs.writeFileSync(path.join(world.root, "output.txt"), "written");
          }),
          validate: () => Effect.void,
        }),
      );
    return Effect.gen(function* () {
      const directory = owner.boundaryClaimsDirectory;
      const independentDirectory = unrelated.boundaryClaimsDirectory;
      if (directory === undefined || independentDirectory === undefined)
        throw new Error("Disk fixtures must own coordinators");
      const table = path.join(directory, "active.json");
      fs.writeFileSync(table, "malformed");
      const refused = yield* write(related).pipe(Effect.result);
      expect(refused).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "WorkspaceSnapshotError" },
      });
      expect(fs.existsSync(path.join(related.root, "output.txt"))).toBe(false);
      yield* write(unrelated);
      expect(fs.readFileSync(path.join(unrelated.root, "output.txt"), "utf8")).toBe("written");
      expect(fs.existsSync(path.join(independentDirectory, "active.json"))).toBe(false);
      expect(fs.readFileSync(table, "utf8")).toBe("malformed");
      fs.rmSync(table);
      yield* write(related);
      related.cleanup();
      expect(fs.existsSync(directory)).toBe(true);
      yield* write(owner);
      owner.cleanup();
      unrelated.cleanup();
      expect(fs.existsSync(directory)).toBe(false);
      expect(fs.existsSync(independentDirectory)).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          related.cleanup();
          owner.cleanup();
          unrelated.cleanup();
        }),
      ),
    );
  },
);
