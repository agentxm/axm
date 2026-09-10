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
const PRODUCTION_SOURCE = "apps/cli/src/root/list/command.ts";
/** Screen's process adapter: the sole writer after runtime startup. */
const OUTPUT_BOUNDARY = "apps/cli/src/screen/streams.ts";
/** The guarded prompt boundary, where requireInteractive lives. */
const PROMPT_BOUNDARY = "apps/cli/src/prompt/helpers.ts";

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

/**
 * The domain and role matrices are proved with real allowed and forbidden
 * imports between real projects, not by asserting config strings. Each probe
 * path is an existing production or test file so the type-aware parser
 * resolves it; the linted text replaces its content.
 */
describe("module boundary constraints", () => {
  let boundaryViolations: (
    code: string,
    filePath: string,
  ) => Promise<ReadonlyArray<{ readonly ruleId: string; readonly message: string }>>;

  beforeAll(() => {
    const eslint = new ESLint({ cwd: repoRoot });
    boundaryViolations = async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath });
      return (result?.messages ?? [])
        .filter(
          (message) =>
            message.ruleId === "@nx/enforce-module-boundaries" ||
            message.ruleId === "no-restricted-imports" ||
            message.ruleId === "@typescript-eslint/no-restricted-imports",
        )
        .map((message) => ({ ruleId: message.ruleId ?? "", message: message.message }));
    };
  });

  const FEATURE = "packages/core/extension-lifecycle/src/index.ts";
  const FEATURE_TEST =
    "packages/core/extension-lifecycle/src/workflows/install-command/workflow.test.ts";
  const CAPABILITY = "packages/core/workspace-operations/src/index.ts";
  const SUPPORTING_INTEGRATION = "packages/supporting/registry-client/src/index.ts";
  const SUPPORTING_INTEGRATION_B = "packages/supporting/agent-integration/src/index.ts";
  const APPLICATION = "apps/cli/src/main.ts";
  const HANDLER = "apps/cli/src/root/list/command.ts";
  const E2E = "apps/cli-e2e/src/utils.ts";

  it("lets core depend on supporting and supporting depend on the contract seams", async () => {
    expect(await boundaryViolations('import "@agentxm/extension-sources";', FEATURE)).toEqual([]);
    // The contract packages export only ./unstable/* subpaths; the bare root
    // is unresolvable everywhere, so the seam is proved through a real subpath.
    expect(
      await boundaryViolations(
        'import "@agentxm/extension-model/unstable/extensions";',
        SUPPORTING_INTEGRATION,
      ),
    ).toEqual([]);
    expect(await boundaryViolations('import "@agentxm/extension-lifecycle";', APPLICATION)).toEqual(
      [],
    );
  });

  it("forbids supporting from depending on core beyond the contract seams", async () => {
    const violations = await boundaryViolations(
      'import "@agentxm/workspace-state";',
      SUPPORTING_INTEGRATION,
    );
    expect(violations.map((violation) => violation.ruleId)).toEqual([
      "@nx/enforce-module-boundaries",
    ]);
    expect(violations[0]?.message).toContain("domain:supporting");
  });

  it("keeps features peers and keeps capabilities and integrations below features", async () => {
    const featureToFeature = await boundaryViolations(
      'import "@agentxm/extension-publish";',
      FEATURE,
    );
    expect(featureToFeature[0]?.message).toContain("role:feature");
    const capabilityToFeature = await boundaryViolations(
      'import "@agentxm/knowledge-query";',
      CAPABILITY,
    );
    expect(capabilityToFeature[0]?.message).toContain("role:capability");
    const integrationToCapability = await boundaryViolations(
      'import "@agentxm/registry-auth";',
      SUPPORTING_INTEGRATION_B,
    );
    expect(integrationToCapability[0]?.message).toContain("role:integration");
  });

  it("keeps engineering libraries out of runtime while tests may compose them", async () => {
    expect(
      (await boundaryViolations('import "@agentxm/test-support";', FEATURE)).map(
        (violation) => violation.ruleId,
      ),
    ).toEqual(["@nx/enforce-module-boundaries"]);
    expect(
      (await boundaryViolations('import "@agentxm/test-support";', APPLICATION)).map(
        (violation) => violation.ruleId,
      ),
    ).toEqual(["@nx/enforce-module-boundaries"]);
    expect(await boundaryViolations('import "@agentxm/test-support";', FEATURE_TEST)).toEqual([]);
  });

  it("confines end-to-end suites to engineering libraries", async () => {
    expect(await boundaryViolations('import "@agentxm/client-e2e-utils";', E2E)).toEqual([]);
    expect(
      (await boundaryViolations('import "@agentxm/extension-lifecycle";', E2E)).map(
        (violation) => violation.ruleId,
      ),
    ).toEqual(["@nx/enforce-module-boundaries"]);
  });

  it("forbids deep imports past a package's declared public API", async () => {
    const violations = await boundaryViolations(
      'import "@agentxm/workspace-state/src/index.js";',
      FEATURE,
    );
    expect(violations.map((violation) => violation.ruleId)).toContain("no-restricted-imports");
  });

  it("confines the generic domain to itself", async () => {
    // No generic package exists yet, so the row cannot be exercised with a real
    // import; pin the constraint until one does.
    const config: { readonly default: ReadonlyArray<unknown> } = await import(
      path.join(repoRoot, "eslint.config.mjs")
    );
    const genericRows = config.default.flatMap((block) => {
      if (typeof block !== "object" || block === null || !("rules" in block)) return [];
      const rules: unknown = block.rules;
      if (typeof rules !== "object" || rules === null) return [];
      const rule: unknown = Reflect.get(rules, "@nx/enforce-module-boundaries");
      if (!Array.isArray(rule) || typeof rule[1] !== "object" || rule[1] === null) return [];
      const production = Reflect.get(rule[1], "enforceBuildableLibDependency") === true;
      const depConstraints: unknown = Reflect.get(rule[1], "depConstraints");
      return (Array.isArray(depConstraints) ? depConstraints : [])
        .filter(
          (constraint) =>
            typeof constraint === "object" &&
            constraint !== null &&
            Reflect.get(constraint, "sourceTag") === "domain:generic",
        )
        .map((constraint) => ({
          production,
          allowed: Reflect.get(constraint, "onlyDependOnLibsWithTags"),
        }));
    });
    expect(genericRows).toEqual([
      { production: true, allowed: ["domain:generic"] },
      { production: false, allowed: ["domain:generic", "role:tooling"] },
    ]);
  });

  it("warns handlers away from writers, plan constructors, and integrations", async () => {
    const warn = (violations: ReadonlyArray<{ readonly ruleId: string }>) =>
      violations.map((violation) => violation.ruleId);
    expect(
      warn(
        await boundaryViolations(
          'import { WorkspaceMutations } from "@agentxm/workspace-state";',
          HANDLER,
        ),
      ),
    ).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(
      warn(
        await boundaryViolations(
          'import { previewOrApplyPlan } from "@agentxm/workspace-operations";',
          HANDLER,
        ),
      ),
    ).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(
      warn(
        await boundaryViolations(
          'import { resolveSource } from "@agentxm/extension-sources";',
          HANDLER,
        ),
      ),
    ).toEqual(["@typescript-eslint/no-restricted-imports"]);
    expect(
      await boundaryViolations(
        'import type { Plan } from "@agentxm/workspace-operations";\nimport { operationPresentation } from "@agentxm/workspace-operations";\nimport { handleInstall } from "@agentxm/extension-lifecycle";',
        HANDLER,
      ),
    ).toEqual([]);
  });
});
