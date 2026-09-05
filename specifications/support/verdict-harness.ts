/** Execute the repository verdict in its Bun host without crossing TS project roots. */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const evaluateVerdict = (expression: string): unknown => {
  const fixture = new URL("../../scripts/specification-verdict-fixtures.ts", import.meta.url).href;
  const verdict = new URL("../../scripts/specification-verdict-lib.ts", import.meta.url).href;
  const program = `
    import { fixtureContext, fixtureInputs, fixtureRun, fixtureSource } from ${JSON.stringify(fixture)};
    import { computeVerdict, renderVerdictMarkdown } from ${JSON.stringify(verdict)};
    const report = (context = fixtureContext(), source = fixtureSource()) =>
      computeVerdict([], [source], context).affected[0]?.evidence;
    process.stdout.write(JSON.stringify(${expression}));
  `;
  const output = execFileSync("bun", ["--conditions=axm-source", "--eval", program], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
  });
  const parsed: unknown = JSON.parse(output);
  return parsed;
};
