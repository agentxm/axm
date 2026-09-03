import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterAll, afterEach } from "vitest";

import { getAppError, handleInstall, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { pinSpecUserHome, snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/mutations-are-closure-atomic",
  title: "A failed workspace mutation leaves every authoritative state family unchanged",
  statement:
    "When a workspace change cannot complete, the command shall fail with a typed error, shall render no result document, and shall leave settings, lockfile, canonical content, projections, and temporary directories exactly as they were.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  status: "accepted",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const userHome = pinSpecUserHome();

/**
 * Install requests that cannot complete. Each must end as a typed failure
 * with the settings, lockfile, canonical content, and projection families all
 * byte-identical to their state before the attempt.
 */
const failingInstalls = [
  {
    label: "a source path that does not exist",
    prepare: (root: string): string => path.join(root, "vendor", "gone"),
  },
  {
    label: "a package whose manifest is not readable as JSON",
    prepare: (root: string): string => {
      const packageRoot = path.join(root, "vendor", "malformed");
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(path.join(packageRoot, "skill.json"), "{ not-json");
      return packageRoot;
    },
  },
] as const;

describe("Failed workspace mutations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    userHome.reset();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });
  afterAll(() => {
    userHome.cleanup();
  });

  it.effect.each(failingInstalls)("an install from $label fails typed and changes nothing", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const source = row.prepare(workspace.root);
      const before = snapshotWorkspaceContent(workspace.root);

      const failure = yield* handleInstall({
        source: Option.some(source),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer), Effect.flip);

      expect(getAppError(failure)._tag).toBe("AppError");
      expect(workspace.rendererState.results).toEqual([]);
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      expect(workspace.exists(".axm/tmp")).toBe(false);
    }),
  );

  it.effect("a reconciliation that cannot resolve a desired extension writes nothing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { skills: { gone: "./vendor/gone" } },
      });
      cleanups.push(workspace.cleanup);
      const before = snapshotWorkspaceContent(workspace.root);

      const failure = yield* handleSync({ preview: false }).pipe(
        Effect.provide(workspace.layer),
        Effect.flip,
      );

      const error = getAppError(failure);
      expect(error.code).toBe("not_found");
      expect(error.detail).toContain("gone");
      expect(workspace.rendererState.results).toEqual([]);
      expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      expect(workspace.exists(".axm/tmp")).toBe(false);
    }),
  );
});
