import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { wrapPrepared } from "../benchmarks/cli-operations/verification.js";
import type {
  PreparedInvocation,
  ProcessResult,
  ScenarioContext,
} from "../benchmarks/cli-operations/fixtures.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const fixture = async (): Promise<ScenarioContext> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "axm-benchmark-verification-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  const home = path.join(root, "home");
  await Promise.all([fs.mkdir(workspace), fs.mkdir(home)]);
  return {
    subject: "candidate",
    root,
    workspace,
    home,
    repoRoot: root,
    binary: "unused",
    run: async () => {
      throw new Error("The verifier does not execute commands");
    },
  };
};

const result: ProcessResult = {
  durationMs: 1,
  exitCode: 0,
  stdout: '{"ok":true,"result":{"outcome":"applied","items":[{"name":"review"}]}}',
  stderr: "",
  cpuUserMs: 1,
  cpuSystemMs: 0,
  peakRssBytes: 1,
  ioReadBytes: null,
  ioWriteBytes: null,
};
const invocation: PreparedInvocation = {
  args: ["operation", "--json"],
  expectedExitCode: 0,
  verify: () => undefined,
};

describe("CLI benchmark native verification", () => {
  it("refuses a successful result when the required semantic edit did not happen", async () => {
    const context = await fixture();
    await fs.writeFile(
      path.join(context.workspace, "axm.json"),
      '{"skills":{"review":{"enabled":true}}}',
    );
    const prepared = await wrapPrepared(context, { id: "json", flags: ["--json"] }, invocation, {
      artifacts: [
        {
          kind: "json",
          path: "axm.json",
          assertions: [{ at: ["skills", "review", "enabled"], equals: false }],
        },
      ],
    });
    await expect(prepared.verify(result)).rejects.toThrow("expected false, observed true");
    await fs.writeFile(
      path.join(context.workspace, "axm.json"),
      '{"skills":{"review":{"enabled":false}}}',
    );
    await expect(prepared.verify(result)).resolves.toBeUndefined();
  });

  it("detects preview writes to both authored and user-native locations", async () => {
    for (const userNative of [false, true]) {
      const context = await fixture();
      const prepared = await wrapPrepared(
        context,
        { id: "preview", flags: ["--preview"] },
        invocation,
        {},
      );
      const target = userNative
        ? path.join(context.home, ".claude", "settings.json")
        : path.join(context.workspace, "skills", "review", "skill.json");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "{}");
      await expect(prepared.verify(result)).rejects.toThrow("Preview changed durable state");
    }
  });

  it("detects same-byte timestamp churn in a no-op", async () => {
    const context = await fixture();
    const file = path.join(context.workspace, "axm.json");
    await fs.writeFile(file, "{}");
    const before = await fs.stat(file);
    const prepared = await wrapPrepared(context, { id: "json", flags: ["--json"] }, invocation, {
      noDurableChange: true,
    });
    await fs.utimes(file, before.atime, new Date(before.mtimeMs + 1000));
    await expect(prepared.verify(result)).rejects.toThrow("Read-only/no-op changed durable state");
  });

  it("permits declared cache output but still catches settlement-state writes", async () => {
    const context = await fixture();
    const prepared = await wrapPrepared(
      context,
      { id: "preview", flags: ["--preview"] },
      invocation,
      {},
    );
    const cache = path.join(context.workspace, ".axm", "cache");
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, "metadata.json"), "{}");
    await expect(prepared.verify(result)).resolves.toBeUndefined();
    await fs.writeFile(path.join(context.workspace, ".axm", "projection-state.json"), "{}");
    await expect(prepared.verify(result)).rejects.toThrow("Preview changed durable state");
  });

  it("permits only the host application cache within user application containers", async () => {
    const context = await fixture();
    const prepared = await wrapPrepared(
      context,
      { id: "preview", flags: ["--preview"] },
      invocation,
      {},
    );
    const relative =
      process.platform === "darwin"
        ? "Library/Caches/axm"
        : process.platform === "win32"
          ? "AppData/Local/axm/cache"
          : ".cache/axm";
    const cache = path.join(context.home, relative);
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, "metadata.json"), "{}");
    await expect(prepared.verify(result)).resolves.toBeUndefined();
    const sibling = path.join(path.dirname(cache), "unrelated-application.json");
    await fs.writeFile(sibling, "{}");
    await expect(prepared.verify(result)).rejects.toThrow("Preview changed durable state");
  });

  it("checks result identity through arrays rather than accepting arbitrary JSON", async () => {
    const context = await fixture();
    const prepared = await wrapPrepared(context, { id: "json", flags: ["--json"] }, invocation, {
      output: { json: [{ at: ["result", "items", 0, "name"], equals: "review" }] },
      outcome: "applied",
    });
    await expect(prepared.verify(result)).resolves.toBeUndefined();
    await expect(
      prepared.verify({
        ...result,
        stdout: '{"ok":true,"result":{"outcome":"applied","items":[]}}',
      }),
    ).rejects.toThrow('expected "review", observed absent');
  });
});
