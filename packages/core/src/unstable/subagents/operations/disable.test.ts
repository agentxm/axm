import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { configuredRow, makeBaseWorkspaceMock, rowsFor } from "../../workspace/test-stubs.js";
import {
  CodingAgentRepository,
  type CodingAgent,
  type CodingAgentRepositoryService,
} from "../../agents/index.js";
import type { SubagentLockEntry } from "../../lockfile/index.js";
import { disableSubagent, type DisableSubagentOperation } from "./disable.js";

const makeOp = (subagentName: string): DisableSubagentOperation => ({
  name: "disable-subagent",
  args: { subagentName },
});

describe("disableSubagent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "disable-subagent-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("removes managed rendered files (relativized) without crashing on absolute paths", () =>
    Effect.gen(function* () {
      const base = path.join(tmpDir, "project");
      const axmDir = path.join(base, ".axm");
      const subagentsDir = path.join(base, ".claude", "agents");
      fs.mkdirSync(subagentsDir, { recursive: true });
      // A managed rendered subagent file. findManagedSubagentFiles returns its
      // absolute path, which the handler must relativize before decoding into
      // the relative-only RenderedFilePathSchema.
      fs.writeFileSync(
        path.join(subagentsDir, "my-subagent.md"),
        "---\nname: my-subagent\n---\n<!-- axm:file v=1 ext=@acme/subagents/my-subagent src=.axm/extensions/@acme/subagents/my-subagent -->\n# my-subagent\n",
      );

      const received: { paths: ReadonlyArray<string> } = { paths: [] };

      // Assertion needed: partial CodingAgent mock at a test boundary — only
      // the methods disableSubagent invokes are implemented.
      const fakeAgent = {
        id: "claude-code",
        resolveEffectiveSubagentsDir: () =>
          Effect.succeed({ _tag: "supported" as const, dir: subagentsDir, warnings: [] }),
        removeSubagent: (args: { renderedFilePaths: ReadonlyArray<unknown> }) => {
          received.paths = args.renderedFilePaths.map((p) => String(p));
          return Effect.succeed({ _tag: "supported" as const, dir: subagentsDir, warnings: [] });
        },
      } as unknown as CodingAgent;

      // Assertion needed: partial CodingAgentRepository mock at a test boundary.
      const fakeRepo = {
        getConfiguredAgents: () => Effect.succeed([fakeAgent]),
      } as unknown as CodingAgentRepositoryService;

      // Assertion needed: minimal lock entry — only presence and `type` matter.
      const lockEntry = {
        type: "local",
        path: "src/my-subagent.md",
      } as unknown as SubagentLockEntry;

      const wsMock = makeBaseWorkspaceMock(axmDir, {
        rows: rowsFor({
          subagent: [
            configuredRow({
              type: "subagent",
              name: "my-subagent",
              source: "@acme/subagents/my-subagent",
            }),
          ],
        }),
        getLockedSubagent: () => Effect.succeed(Option.some(lockEntry)),
      });

      const layers = Layer.mergeAll(
        NodeServices.layer,
        WorkspaceMutations.layer(wsMock),
        Layer.succeed(CodingAgentRepository, fakeRepo),
      );

      const result = yield* disableSubagent(makeOp("my-subagent")).pipe(Effect.provide(layers));

      expect(result.result).toBe("success");
      // The fix: rendered file paths handed to removeSubagent are relative.
      expect(received.paths.length).toBe(1);
      for (const p of received.paths) {
        expect(path.isAbsolute(p)).toBe(false);
      }
    }),
  );
});
