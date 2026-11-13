import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import type { Reporter, TestModule, TestSpecification, Vitest } from "vitest/node";
import { WireReceiptSchema, WireRegisterSchema, WireWitnessSchema } from "./wire-contracts.js";
import { wireCoverage } from "./wire-coverage.js";

interface Options {
  readonly directory: string;
  readonly output: string;
  readonly requireComplete?: string;
  readonly suiteFiles: ReadonlyArray<string>;
}

/** The report contains captured document hashes and gaps, never credentials or raw stdout. */
export default class WireCoverageReporter implements Reporter {
  private nameFiltered = false;
  private completeSuite = false;
  constructor(private readonly options: Options) {}

  onInit(context: Vitest): void {
    this.nameFiltered = context.config.testNamePattern !== undefined;
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    fs.rmSync(this.options.output, { force: true });
    fs.rmSync(this.options.directory, { recursive: true, force: true });
    const selected = new Set(specifications.map((specification) => specification.moduleId));
    this.completeSuite =
      !this.nameFiltered && this.options.suiteFiles.every((file) => selected.has(file));
  }

  onTestRunEnd(
    _modules: ReadonlyArray<TestModule>,
    _errors: ReadonlyArray<unknown>,
    reason: "passed" | "failed" | "interrupted",
  ): void {
    const files = fs.existsSync(this.options.directory)
      ? fs.readdirSync(this.options.directory)
      : [];
    const read = (name: string) => fs.readFileSync(path.join(this.options.directory, name), "utf8");
    const registers = files
      .filter((name) => name.startsWith("register-"))
      .map((name) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(WireRegisterSchema))(read(name)),
      );
    const receipts = files
      .filter((name) => name.startsWith("response-"))
      .map((name) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(WireReceiptSchema))(read(name)),
      );
    const witnesses = files
      .filter((name) => name.startsWith("witness-"))
      .map((name) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(WireWitnessSchema))(read(name)),
      );
    const coverage = wireCoverage(
      registers.flatMap((entry) => entry.routes),
      receipts,
      witnesses,
    );
    const schemaHashes = [...new Set(registers.map((entry) => entry.schemaSha256))];
    const enforceComplete =
      this.options.requireComplete === "1" ||
      (this.options.requireComplete !== "0" && this.completeSuite);
    const gaps = [
      ...coverage.missingResults,
      ...coverage.missingVariants,
      ...coverage.missingExternalDocuments,
      ...coverage.unregisteredRequirements,
      ...coverage.unfrozenAdapters,
    ];
    const report = {
      ...coverage,
      testRun: reason,
      completeSuite: this.completeSuite,
      enforced: enforceComplete,
      complete: reason === "passed" && gaps.length === 0 && schemaHashes.length === 1,
      schemaHashes,
      artifacts: [...new Set(registers.map((entry) => entry.artifact))],
      validatedDocuments: receipts.filter((entry) => entry.schemaSha256 !== undefined).length,
      receipts,
    };
    fs.mkdirSync(path.dirname(this.options.output), { recursive: true });
    fs.writeFileSync(this.options.output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(
      `\nWire contracts: ${report.validatedDocuments} captured documents validated; ${coverage.observedResults.length}/${coverage.requiredResults.length} adapter/mode pairs observed.\nCoverage report: ${this.options.output}\n`,
    );
    if (gaps.length > 0)
      process.stdout.write(`Unverified wire variants: ${[...new Set(gaps)].join(", ")}\n`);
    if (coverage.externalDocuments.length > 0)
      process.stdout.write(
        "External document and raw credential refusal receipts are recorded separately; they are not counted as bundled-schema validation.\n",
      );
    if (schemaHashes.length > 1)
      process.stdout.write(
        "Wire coverage used different schema bundles; mixed artifacts cannot establish one complete result.\n",
      );
    if (enforceComplete && (gaps.length > 0 || schemaHashes.length !== 1))
      throw new Error(
        "The assembled CLI wire coverage matrix is incomplete; see wire-coverage.json.",
      );
  }
}
