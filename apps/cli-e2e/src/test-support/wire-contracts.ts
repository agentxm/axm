/** Observe only shipped CLI documents. Product source schemas never enter this harness. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaRepresentation from "effect/SchemaRepresentation";
import { createTempDir, type CliResult, type RunCliOptions } from "@agentxm/client-e2e-utils";

const ObjectSchema = Schema.Record(Schema.String, Schema.Unknown);
const object = Schema.decodeUnknownSync(ObjectSchema);
const parseObject = Schema.decodeUnknownSync(Schema.fromJsonString(ObjectSchema));
const objects = Schema.decodeUnknownSync(Schema.Record(Schema.String, ObjectSchema));
const strings = Schema.decodeUnknownSync(Schema.Array(Schema.String));
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

/** Apply a discovered whole-stdout JSON Schema, including its local definitions and patterns. */
export const wholeStdoutValidator = (text: string) => {
  const document = parseObject(text);
  return Schema.decodeUnknownSync(
    Schema.toType(
      SchemaRepresentation.fromJsonSchemaDocument(
        {
          dialect: "draft-2020-12",
          schema: document,
          definitions: objects(document["$defs"] ?? {}),
        },
        { patterns: "apply" },
      ),
    ),
    { onExcessProperty: "error" },
  );
};

const assertWireExit = (result: CliResult, output: Readonly<Record<string, unknown>>): void => {
  if (output["ok"] !== (result.exitCode === 0))
    throw new Error(
      `Result ok=${String(output["ok"])} disagrees with the process exit status ${result.exitCode}.`,
    );
};

/** Cross-channel facts are checked independently of the stdout shape validator. */
export const assertWireCompletion = (
  result: CliResult,
  output: Readonly<Record<string, unknown>>,
): "observed" | "not-observed" => {
  assertWireExit(result, output);
  const parse = Schema.decodeUnknownOption(Schema.fromJsonString(ObjectSchema));
  const events = result.stderr.split("\n").flatMap((line) => {
    const parsed = parse(line);
    return Option.isSome(parsed) &&
      parsed.value["type"] === "progress" &&
      Schema.is(ObjectSchema)(parsed.value["event"])
      ? [parsed.value["event"]]
      : [];
  });
  const starts = events.filter((event) => event["_tag"] === "OperationStarted");
  const settlements = events.filter((event) => event["_tag"] === "OperationSettled");
  if (starts.length === 0 && settlements.length === 0) return "not-observed";
  if (starts.length !== 1 || settlements.length !== 1)
    throw new Error(
      `An ordinary result must have one settled command lifecycle after it starts; observed ${starts.length} starts and ${settlements.length} settlements.`,
    );
  const start = starts[0];
  const settlement = settlements[0];
  if (start === undefined || settlement === undefined)
    throw new Error("The captured command lifecycle is incomplete.");
  if (events.indexOf(settlement) <= events.indexOf(start))
    throw new Error("OperationSettled precedes OperationStarted on stderr.");
  if (start["mode"] !== output["mode"])
    throw new Error(
      `Result mode=${String(output["mode"])} disagrees with OperationStarted.mode=${String(start["mode"])}.`,
    );
  if (settlement["outcome"] !== output["outcome"])
    throw new Error(
      `Result outcome=${String(output["outcome"])} disagrees with OperationSettled.outcome=${String(settlement["outcome"])}.`,
    );
  return "observed";
};

export const WireReceiptSchema = Schema.Struct({
  artifact: Schema.String,
  route: Schema.String,
  family: Schema.String,
  document: Schema.Literals(["result", "error", "help", "version", "schema", "external"]),
  mode: Schema.optional(Schema.String),
  outcome: Schema.optional(Schema.String),
  variants: Schema.Array(Schema.String),
  exitCode: Schema.Number,
  stdoutSha256: Schema.String,
  schemaSha256: Schema.optional(Schema.String),
  lifecycleEvidence: Schema.optional(Schema.Literals(["observed", "quiet", "not-observed"])),
});
export type WireReceipt = typeof WireReceiptSchema.Type;
export const WireWitnessSchema = Schema.Struct({
  stdoutSha256: Schema.String,
  variant: Schema.String,
});
/** Call only after independent fixture assertions establish the named boundary. */
export const recordWireWitness = (result: CliResult, variant: "generic-error:before-operation") =>
  writeEvidence("witness", { stdoutSha256: digest(result.stdout), variant });
const WireRouteSchema = Schema.Struct({
  route: Schema.String,
  family: Schema.String,
  class: Schema.String,
  modes: Schema.Array(Schema.String),
});
export type WireRoute = typeof WireRouteSchema.Type;
export const WireRegisterSchema = Schema.Struct({
  artifact: Schema.String,
  schemaSha256: Schema.String,
  routes: Schema.Array(WireRouteSchema),
});

type Runner = (args: ReadonlyArray<string>, options?: RunCliOptions) => Promise<CliResult>;
interface Discovery {
  readonly document: Record<string, unknown>;
  readonly routes: ReadonlyArray<WireRoute>;
  readonly roots: Record<string, Record<string, unknown>>;
  readonly rootHelp: Record<string, unknown>;
  readonly sha256: string;
}

const writeEvidence = (name: string, value: unknown) => {
  const directory = process.env["AXM_WIRE_COVERAGE_DIRECTORY"];
  if (directory === undefined) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${name}-${randomUUID()}.json`), JSON.stringify(value));
};

const variantsOf = (
  args: ReadonlyArray<string>,
  family: string,
  output: Record<string, unknown>,
): ReadonlyArray<string> => {
  const result = Schema.is(ObjectSchema)(output["result"]) ? output["result"] : undefined;
  const scalar =
    output["result"] === null || ["string", "number", "boolean"].includes(typeof output["result"]);
  const rawConcept =
    result !== undefined &&
    Schema.is(ObjectSchema)(result["concept"]) &&
    typeof result["concept"]["raw"] === "string";
  return [
    ...(family === "local-check" && output["result"] !== undefined
      ? [output["ok"] === true ? "local-check:satisfied" : "local-check:attention-required"]
      : []),
    ...(output["type"] === "help" ? ["formatter:help"] : []),
    ...(output["type"] === "version" ? ["formatter:version"] : []),
    ...(output["ok"] === false && output["result"] === undefined ? ["generic-error"] : []),
    ...(output["ok"] === false && output["result"] !== undefined ? ["operation-failure"] : []),
    ...(family === "login" && output["outcome"] === "pending-human" ? ["login:pending-human"] : []),
    ...(family === "registry-view" && scalar ? ["registry-view:scalar"] : []),
    ...(family === "subagent-show" &&
    result !== undefined &&
    args.includes("--render") &&
    (result["status"] === "rendered" || result["status"] === "unsupported")
      ? [`subagent-render:${result["status"] === "rendered" ? "supported" : "unsupported"}`]
      : []),
    ...(family === "knowledge-concept-get" && rawConcept && args.includes("--raw")
      ? ["knowledge-get:raw"]
      : []),
    ...(family === "json-refused" && output["ok"] === false && output["code"] === "usage"
      ? ["credential-refusal"]
      : []),
    ...(family === "workspace-lint" && args.includes("--fix") && output["result"] !== undefined
      ? [`lint-fix:${output["mode"]}`]
      : []),
    ...(family === "publish" && output["result"] !== undefined
      ? [`publish:${output["outcome"]}`]
      : []),
  ];
};

/**
 * Validate the response already captured by a fixture. Discovery runs once per
 * runner in its own disposable home, never in the observed workspace. The
 * performance suite intentionally uses its separate unwrapped binary runner.
 */
export const withWireContracts = (run: Runner, artifact: string): Runner => {
  let discovery: Promise<Discovery> | undefined;
  const validators = new Map<string, ReturnType<typeof wholeStdoutValidator>>();
  const help = new Map<string, Promise<Record<string, unknown>>>();
  const discover = (): Promise<Discovery> =>
    (discovery ??= Effect.runPromise(
      Effect.tryPromise(async () => {
        const temporary = createTempDir("axm-wire-discovery-");
        try {
          const options = {
            cwd: temporary.path,
            env: {
              HOME: temporary.path,
              AXM_USER_HOME: temporary.path,
              AXM_TOKEN: "",
              AXM_TOKEN_FILE: "",
              AXM_NO_UPDATE_CHECK: "1",
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
            },
          };
          const exported = await run(["help", "machine-output-schema", "--json"], options);
          if (exported.exitCode !== 0)
            throw new Error("The shipped CLI could not discover its aggregate stdout schemas.");
          const document = object(object(parseObject(exported.stdout)["result"])["schema"]);
          const roots = objects(document["x-axm-routes"]);
          const contracts = objects(document["x-axm-command-contracts"]);
          const routes = Object.entries(contracts).map(([route, contract]): WireRoute => ({
            route,
            family:
              typeof roots[route]?.["$ref"] === "string"
                ? roots[route]["$ref"].replace("#/$defs/family.", "")
                : String(contract["class"]),
            class: Schema.decodeUnknownSync(Schema.String)(contract["class"]),
            modes: strings(contract["modes"]),
          }));
          const rootHelpResult = await run(["--help", "--json"], options);
          if (rootHelpResult.exitCode !== 0)
            throw new Error("The shipped CLI could not discover its root argument grammar.");
          const rootHelp = parseObject(rootHelpResult.stdout);
          const sha256 = digest(JSON.stringify(document));
          writeEvidence("register", { artifact, schemaSha256: sha256, routes });
          return { document, roots, routes, rootHelp, sha256 };
        } finally {
          temporary.cleanup();
        }
      }),
    ));

  const routeFor = async (args: ReadonlyArray<string>, discovered: Discovery): Promise<string> => {
    let route = "axm";
    // Global options may precede or separate command segments. Their value
    // arity comes from public help rather than another parser-owned roster.
    const flags = new Map<string, boolean>();
    for (const key of ["flags", "globalFlags", "inheritedFlags"]) {
      for (const value of Schema.decodeUnknownSync(Schema.Array(ObjectSchema))(
        discovered.rootHelp[key] ?? [],
      )) {
        const takesValue = String(value["type"]).toLowerCase() !== "boolean";
        for (const name of [
          Schema.decodeUnknownSync(Schema.String)(value["name"]),
          ...strings(value["aliases"] ?? []),
        ])
          flags.set(name.replace(/^-+/u, ""), takesValue);
      }
    }
    for (let index = 0; index < args.length; index++) {
      const word = args[index];
      if (word === undefined || word === "--") break;
      if (word.startsWith("-")) {
        if (!word.includes("=") && flags.get(word.replace(/^-+/u, "")) === true) index++;
        continue;
      }
      const next = `${route} ${word}`;
      if (discovered.routes.some((entry) => entry.route === next)) {
        route = next;
        continue;
      }
      if (!discovered.routes.some((entry) => entry.route.startsWith(`${route} `))) break;
      // Resolve aliases only when one is encountered; canonical calls add no
      // per-route process. Help itself remains passive and credential-free.
      let document = discovered.rootHelp;
      if (route !== "axm") {
        let pending = help.get(route);
        if (pending === undefined) {
          const temporary = createTempDir("axm-wire-alias-");
          pending = run([...route.split(" ").slice(1), "--help", "--json"], {
            cwd: temporary.path,
            env: {
              HOME: temporary.path,
              AXM_USER_HOME: temporary.path,
              AXM_TOKEN: "",
              AXM_TOKEN_FILE: "",
              AXM_NO_UPDATE_CHECK: "1",
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
            },
          })
            .then((result) => parseObject(result.stdout))
            .finally(temporary.cleanup);
          help.set(route, pending);
        }
        document = await pending;
      }
      const commands = Schema.decodeUnknownSync(Schema.Array(ObjectSchema))(
        document["subcommands"] ?? [],
      ).flatMap((group) => Schema.decodeUnknownSync(Schema.Array(ObjectSchema))(group["commands"]));
      const alias = commands.find((command) => command["alias"] === word);
      if (alias === undefined) break;
      route = `${route} ${Schema.decodeUnknownSync(Schema.String)(alias["name"])}`;
    }
    return route;
  };

  return async (args, options) => {
    const result = await run(args, options);
    const delimiter = args.indexOf("--");
    const parsedArgs = delimiter === -1 ? args : args.slice(0, delimiter);
    if (
      !parsedArgs.some(
        (argument) => argument === "--json" || argument === "-j" || argument === "--json=true",
      ) ||
      options?.closedStdout === true
    )
      return result;
    const discovered = await discover();
    const route = await routeFor(parsedArgs, discovered);
    const contract = discovered.routes.find((entry) => entry.route === route);
    if (contract === undefined) throw new Error(`No discovered output contract for ${route}.`);
    // The explicit plain credential channel rejects mixed modes with empty
    // stdout. Its independent secrecy assertions stay in the credential
    // fixture; an empty channel is not counted as JSON-schema validation.
    if (
      contract.class === "json-refused" &&
      parsedArgs.includes("--plain") &&
      result.exitCode !== 0 &&
      result.stdout === ""
    ) {
      writeEvidence("response", {
        artifact,
        route,
        family: contract.family,
        document: "external",
        variants: ["credential-plain-refusal"],
        exitCode: result.exitCode,
        stdoutSha256: digest(result.stdout),
      } satisfies WireReceipt);
      return result;
    }
    const output = parseObject(result.stdout);
    const external = contract.class === "external-document" && output["bomFormat"] !== undefined;
    const root = external
      ? undefined
      : (discovered.roots[route] ?? {
          anyOf: [
            discovered.document["x-axm-error-envelope"],
            discovered.document["x-axm-formatter-help"],
            discovered.document["x-axm-formatter-version"],
          ],
        });
    if (root !== undefined) {
      let validate = validators.get(route);
      if (validate === undefined) {
        validate = wholeStdoutValidator(
          JSON.stringify({ ...object(root), $defs: discovered.document["$defs"] }),
        );
        validators.set(route, validate);
      }
      try {
        if (!isDeepStrictEqual(validate(output), output))
          throw new Error("Decoding changed the complete stdout document.");
      } catch (cause) {
        throw new Error(
          `Actual stdout violates the discovered whole-document schema for ${route} (${contract.family}, exit ${result.exitCode}).`,
          { cause },
        );
      }
    }
    const document = external
      ? "external"
      : output["type"] === "help"
        ? "help"
        : output["type"] === "version"
          ? "version"
          : output["$schema"] !== undefined
            ? "schema"
            : output["result"] !== undefined
              ? "result"
              : "error";
    let completionEvidence: ReturnType<typeof assertWireCompletion> | undefined;
    if (document === "error") {
      try {
        assertWireExit(result, output);
      } catch (cause) {
        throw new Error(`Actual error envelope disagrees with the process exit for ${route}.`, {
          cause,
        });
      }
    }
    if (document === "result") {
      try {
        completionEvidence = assertWireCompletion(result, output);
      } catch (cause) {
        throw new Error(
          `Actual result completion disagrees across stdout, stderr or exit for ${route}.`,
          { cause },
        );
      }
    }
    const started = Schema.decodeUnknownOption(
      Schema.fromJsonString(
        Schema.Struct({
          type: Schema.Literal("progress"),
          event: Schema.Struct({ _tag: Schema.Literal("OperationStarted") }),
        }),
      ),
    );
    const genericAfterStart =
      document === "error" &&
      result.stderr.split("\n").some((line) => Option.isSome(started(line)));
    writeEvidence("response", {
      artifact,
      route,
      family: contract.family,
      document,
      ...(typeof output["mode"] === "string" ? { mode: output["mode"] } : {}),
      ...(typeof output["outcome"] === "string" ? { outcome: output["outcome"] } : {}),
      variants: [
        ...variantsOf(parsedArgs, contract.family, output),
        ...(genericAfterStart ? ["generic-error:after-operation"] : []),
      ],
      exitCode: result.exitCode,
      stdoutSha256: digest(result.stdout),
      ...(external ? {} : { schemaSha256: discovered.sha256 }),
      ...(completionEvidence === undefined
        ? {}
        : {
            lifecycleEvidence:
              completionEvidence === "not-observed" &&
              parsedArgs.some((argument) => argument === "--quiet" || argument === "-q")
                ? "quiet"
                : completionEvidence,
          }),
    } satisfies WireReceipt);
    return result;
  };
};
