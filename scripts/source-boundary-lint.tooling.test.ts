import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The production machine-output, result-streaming, and prompt boundaries are
 * enforced by the `axm-policy` ESLint rules rather than by a raw-text scanner.
 *
 * These cases lint through the repository's real flat configuration so they
 * cover both properties that matter. The rules must report the intended syntax
 * regardless of formatting, and they must stay *reachable*: flat config
 * replaces a rule's options wholesale, so restrictions expressed as
 * `no-restricted-syntax` selectors were silently dropped by a later block
 * matching the same files. Dedicated rule keys are what let the boundary
 * scoping compose, and the reachability case below guards that directly.
 */

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** A production module subject to every boundary rule. */
const PRODUCTION_SOURCE = "packages/cli/src/root/list/command.ts";
/** Screen's process adapter: the sole writer after runtime startup. */
const OUTPUT_BOUNDARY = "packages/cli/src/screen/streams.ts";
/** The guarded prompt boundary, where requireInteractive lives. */
const PROMPT_BOUNDARY = "packages/cli/src/prompt/helpers.ts";

describe("production source boundary lint rules", () => {
  let violations: (code: string, filePath: string) => Promise<ReadonlyArray<string>>;

  beforeAll(() => {
    const eslint = new ESLint({ cwd: repoRoot });
    violations = async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath });
      return (result?.messages ?? [])
        .filter((message) => message.ruleId?.startsWith("axm-policy/") === true)
        .map((message) => `${message.ruleId ?? ""}: ${message.message}`);
    };
  });

  it("reports process stream writes and console calls whatever the spacing", async () => {
    expect(await violations("process.stdout.write('x');", PRODUCTION_SOURCE)).toEqual([
      "axm-policy/no-direct-process-output: Route CLI output through Screen instead of writing process.stdout directly.",
    ]);
    expect(await violations("process . stderr . write('x');", PRODUCTION_SOURCE)).toEqual([
      "axm-policy/no-direct-process-output: Route CLI output through Screen instead of writing process.stderr directly.",
    ]);
    expect(await violations("console.log(a); console.error(b);", PRODUCTION_SOURCE)).toHaveLength(
      2,
    );
  });

  it("reports called and point-free Prompt.run whatever the spacing", async () => {
    expect(await violations("const answer = Prompt . run(prompt);", PRODUCTION_SOURCE)).toEqual([
      "axm-policy/no-unguarded-prompt-run: Production prompts must run through the requireInteractive prompt boundary.",
    ]);
    expect(await violations("effect.pipe(Prompt.run);", PRODUCTION_SOURCE)).toHaveLength(1);
    expect(await violations("runner.run(task); Command.run(argv);", PRODUCTION_SOURCE)).toEqual([]);
  });

  it("reports the streaming result shape in code position", async () => {
    expect(await violations("renderer.resultStream(stream, schema);", PRODUCTION_SOURCE)).toEqual([
      "axm-policy/no-result-stream: Ordinary --json output is one document; streaming requires a future explicit output mode.",
    ]);
    expect(await violations('renderer["resultStream"](stream);', PRODUCTION_SOURCE)).toHaveLength(
      1,
    );
  });

  it("governs the result shape rather than the word, so prose stays writable", async () => {
    expect(
      await violations(
        "// resultStream is deliberately unsupported\nconst ok = 1;",
        PRODUCTION_SOURCE,
      ),
    ).toEqual([]);
    expect(
      await violations('const message = "resultStream is unsupported";', PRODUCTION_SOURCE),
    ).toEqual([]);
  });

  it("exempts each owning boundary module from its own rule only", async () => {
    expect(await violations("process.stdout.write('x');", OUTPUT_BOUNDARY)).toEqual([]);
    expect(await violations("const answer = Prompt.run(prompt);", OUTPUT_BOUNDARY)).toHaveLength(1);

    expect(await violations("const answer = Prompt.run(prompt);", PROMPT_BOUNDARY)).toEqual([]);
    expect(await violations("console.log(a);", PROMPT_BOUNDARY)).toHaveLength(1);
  });

  it("keeps the boundary rules reachable alongside the co-located restrictions", async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText("process.stdout.write(String(new Date()));", {
      filePath: PRODUCTION_SOURCE,
    });
    const reported = new Set((result?.messages ?? []).map((message) => message.ruleId));
    // A later flat-config block must not silently replace either restriction.
    expect(reported).toContain("axm-policy/no-direct-process-output");
    expect(reported).toContain("no-restricted-syntax");
  });
});
