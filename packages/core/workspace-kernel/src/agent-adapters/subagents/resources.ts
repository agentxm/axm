import * as Effect from "effect/Effect";
import { parseTOML } from "toml-eslint-parser";
import YAML from "yaml";
import { bindPackageResource, PackageResourceInvalid } from "../../locations/index.js";
import { stringifyTomlValue } from "../toml.js";

interface NativeDefinition {
  readonly format: "markdown" | "toml";
  readonly content: string;
}

/** Host fields select resources; the binding mechanism only knows package paths. */
export const bindSubagentResources = Effect.fn("bindSubagentResources")(function* (args: {
  readonly agentId: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly native?: NativeDefinition;
  readonly base: string;
  readonly sourceRoot: string;
  readonly retainedRoot: string;
}) {
  let configuration = args.configuration;
  let body = args.body;
  let native = args.native;
  const resources: Array<{ readonly path: string; readonly content: string }> = [];
  const bind = (reference: string) =>
    bindPackageResource({ ...args, reference }).pipe(
      Effect.tap((resource) =>
        Effect.sync(() => {
          resources.push({ path: resource.relativePath, content: resource.content });
        }),
      ),
    );
  const instructions = configuration["model_instructions_file"];
  if (
    args.agentId === "codex" &&
    typeof instructions === "string" &&
    !/^(?:[\\/]|~[\\/]|[A-Za-z]:[\\/]|[a-z]+:\/\/)/u.test(instructions)
  ) {
    const resource = yield* bind(instructions);
    configuration = { ...configuration, model_instructions_file: resource.retainedPath };
    if (native !== undefined) {
      const original = native.content;
      const content = yield* Effect.try({
        try: () => {
          const document = parseTOML(original);
          const entry = document.body[0].body.find(
            (node) =>
              node.type === "TOMLKeyValue" &&
              node.key.keys.length === 1 &&
              node.key.keys.some(
                (key) =>
                  (key.type === "TOMLBare" ? key.name : key.value) === "model_instructions_file",
              ),
          );
          if (entry?.type !== "TOMLKeyValue") throw new Error("Resource field is missing.");
          return (
            original.slice(0, entry.value.range[0]) +
            stringifyTomlValue(resource.retainedPath) +
            original.slice(entry.value.range[1])
          );
        },
        catch: (cause) =>
          new PackageResourceInvalid({
            reference: instructions,
            detail: "The native instruction resource field cannot be bound.",
            cause,
          }),
      });
      native = { ...native, content };
    }
  }
  const prompt = configuration["prompt"];
  if (args.agentId === "opencode" && typeof prompt === "string" && prompt.includes("{file:")) {
    const matches = [...prompt.matchAll(/\{file:([^}]+)\}/gu)];
    if (matches.length === 0 || prompt.replace(/\{file:([^}]+)\}/gu, "").includes("{file:"))
      return yield* new PackageResourceInvalid({
        reference: prompt,
        detail: "The prompt resource reference is malformed.",
      });
    const replacements = yield* Effect.forEach(matches, (match) =>
      bind(match[1] ?? "").pipe(
        Effect.map((resource) => ({ token: match[0], content: resource.content.trim() })),
      ),
    );
    const contents = new Map(
      replacements.map((replacement) => [replacement.token, replacement.content]),
    );
    body = prompt.replace(/\{file:([^}]+)\}/gu, (token) => contents.get(token) ?? token);
    const { prompt: _prompt, ...remaining } = configuration;
    configuration = remaining;
    // OpenCode's Markdown loader sets prompt from the body after reading
    // frontmatter. An absolute {file:...} in frontmatter would remain ineffective.
    // https://github.com/anomalyco/opencode/blob/v1.2.27/packages/opencode/src/config/config.ts
    if (native !== undefined) {
      const original = native.content;
      const content = yield* Effect.try({
        try: () => {
          const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(original);
          if (match === null) throw new Error("Native frontmatter is missing.");
          const document = YAML.parseDocument(match[1] ?? "");
          document.delete("prompt");
          return `---\n${document.toString()}---\n${body}`;
        },
        catch: (cause) =>
          new PackageResourceInvalid({
            reference: prompt,
            detail: "The native prompt resource field cannot be bound.",
            cause,
          }),
      });
      native = { ...native, content };
    }
  }
  return { configuration, body, ...(native === undefined ? {} : { native }), resources };
});
