/**
 * Projection units whose bytes differ from what AXM last wrote.
 *
 * A person may edit a generated file or region, but AXM replaces it the next
 * time its inputs change. The finding tells them so and names where the
 * content actually comes from, so the edit lands somewhere it survives. It
 * judges neither currency nor ownership.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  extensionNameFromFilename,
  resolveInstructionsConfig,
  type ProjectionOutputObservation,
} from "@agentxm/workspace-kernel/projection";
import type {
  CanonicalObservation,
  DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

const RULE_ID = "workspace/projection-modified";
const MAX_LISTED_SOURCES = 5;
const WITHDRAW = "Run `axm sync` to withdraw it.";

interface ProjectionSources {
  readonly nodes: ReadonlyArray<DesiredExtensionNode>;
  /** Canonical package path of each desired node, keyed `type:name`. */
  readonly canonicalPaths: ReadonlyMap<string, string>;
  readonly instructionFile: Option.Option<string>;
}

const relativeToRoot = (root: string, file: string): string => {
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The name a person uses to refer to a contributing package. */
const nodeRef = ({ identity }: DesiredExtensionNode): string => {
  switch (identity.authority) {
    case "inline":
      return identity.name;
    case "git":
    case "http":
    case "path":
      return identity.fqn ?? identity.locator;
    default:
      return identity.fqn;
  }
};

/** How a person changes one contributing package so the change survives. */
const changeSource = (
  root: string,
  sources: ProjectionSources,
  node: DesiredExtensionNode,
): string => {
  const ref = nodeRef(node);
  if (node.identity.authority === "workspace") {
    const canonical = sources.canonicalPaths.get(`${node.type}:${node.name}`);
    return canonical === undefined
      ? `${ref} (edit its authored source)`
      : `${ref} (edit \`${relativeToRoot(root, canonical)}\`)`;
  }
  return `${ref} (run \`axm fork ${ref} <new-extension>\` and edit the fork)`;
};

const regionRecovery = (
  root: string,
  sources: ProjectionSources,
  type: Extract<ExtensionType, "rule" | "knowledge">,
): string => {
  const contributors = sources.nodes.filter((node) => node.type === type);
  if (contributors.length === 0) return WITHDRAW;
  const listed = contributors
    .slice(0, MAX_LISTED_SOURCES)
    .map((node) => changeSource(root, sources, node));
  const more = contributors.length - listed.length;
  return `The region is generated from: ${listed.join(", ")}${more > 0 ? `, and ${more} more` : ""}.`;
};

const recoveryFor = (
  root: string,
  sources: ProjectionSources,
  observation: ProjectionOutputObservation,
): string => {
  switch (observation.kind) {
    case "rules":
      return regionRecovery(root, sources, "rule");
    case "knowledge":
      return regionRecovery(root, sources, "knowledge");
    case "instructions":
      // With instruction-file management off, no instruction output is declared.
      return Option.match(sources.instructionFile, {
        onNone: () => WITHDRAW,
        onSome: (file) =>
          observation.path === ".gitignore"
            ? "The region lists the configured agents' instruction aliases; change `agents` or `instructionFiles.gitignoreAliases` in settings."
            : `Edit \`${file}\`; the alias is a copy of it.`,
      });
    case "subagents": {
      const name = extensionNameFromFilename(basename(observation.path));
      const node = sources.nodes.find(
        (candidate) => candidate.type === "subagent" && candidate.name === name,
      );
      return node === undefined ? WITHDRAW : `Change ${changeSource(root, sources, node)}.`;
    }
  }
};

const readSources = (context: WorkspaceRuleContext) =>
  Effect.gen(function* () {
    const graph =
      context.health === undefined
        ? Option.none()
        : Result.getSuccess(yield* Effect.result(context.health.desiredState));
    const canonical =
      context.health?.canonicalObservations === undefined
        ? []
        : Result.getOrElse(
            yield* Effect.result(context.health.canonicalObservations),
            (): ReadonlyArray<{ readonly observation: CanonicalObservation }> => [],
          );
    const settings = yield* context.workspace.state.settings.pipe(
      Effect.catch(() => Effect.succeed(Option.none())),
    );
    const instructions = Option.getOrUndefined(settings)?.instructionFiles;
    return {
      nodes: Option.match(graph, { onNone: () => [], onSome: ({ nodes }) => nodes }),
      canonicalPaths: new Map(
        canonical.flatMap(({ observation }) =>
          observation.path === undefined
            ? []
            : [[`${observation.type}:${observation.name}`, observation.path] as const],
        ),
      ),
      instructionFile:
        instructions === undefined || instructions === false
          ? Option.none()
          : Option.some(resolveInstructionsConfig(instructions).fileName),
    } satisfies ProjectionSources;
  });

export const projectionModifiedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Projected files and regions match what AXM last wrote.",
  kind: "advisory",
  severity: "info",
  check: (context) =>
    Effect.gen(function* () {
      if (context.projectionOutputs === undefined) return [];
      const entries = yield* context.projectionOutputs;
      const unreadable = entries.flatMap((entry): ReadonlyArray<AdvisoryFinding> =>
        Result.isFailure(entry)
          ? [
              {
                kind: "advisory",
                ruleId: RULE_ID,
                severity: "info",
                message: `\`${entry.failure.path}\` could not be read to compare it with what AXM last wrote.`,
                location: { file: entry.failure.path },
              },
            ]
          : [],
      );
      const modified = entries.flatMap((entry) =>
        Result.isSuccess(entry) && entry.success.recorded !== entry.success.observed
          ? [entry.success]
          : [],
      );
      if (modified.length === 0) return unreadable;
      const sources = yield* readSources(context);
      return [
        ...unreadable,
        ...modified.map((observation): AdvisoryFinding => ({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "info",
          message: `\`${observation.path}\` differs from what AXM last wrote; AXM replaces it when its inputs change. ${recoveryFor(context.subject.root, sources, observation)}`,
          location: { file: observation.path },
        })),
      ];
    }),
};
