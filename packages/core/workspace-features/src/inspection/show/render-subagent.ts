import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { loadSubagentPackage } from "@agentxm/extension-content";
import {
  isConfigurableAgentId,
  type AgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import {
  CodingAgentRepository,
  compileSubagentImplementation,
} from "@agentxm/workspace-kernel/projection";
import {
  acceptedCanonicalObservation,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";

import { ConfiguredAgentReasonCodeSchema } from "@agentxm/workspace-kernel/operations";
import { WorkspaceInspectionFailed } from "../errors.js";
import { ShowExtension } from "./show-extension.js";

export const SubagentRenderResultSchema = Schema.Struct({
  name: Schema.String,
  fqn: Schema.String,
  type: Schema.Literal("subagent"),
  version: Schema.String,
  enabled: Schema.NullOr(Schema.Boolean),
  locked: Schema.Boolean,
  source: Schema.String,
  scope: Schema.Literals(["project", "user"]),
  agentId: Schema.String,
  status: Schema.Literals(["rendered", "unsupported"]),
  mode: Schema.optionalKey(Schema.Literals(["portable", "customized", "native"])),
  nativeName: Schema.optionalKey(Schema.String),
  reasonCode: Schema.optionalKey(ConfiguredAgentReasonCodeSchema),
  reason: Schema.optionalKey(Schema.String),
  sourceDependencies: Schema.Array(Schema.String),
  artifacts: Schema.Array(Schema.Struct({ path: Schema.String, content: Schema.String })),
  qualifications: Schema.Array(Schema.String),
});
export type SubagentRenderResult = typeof SubagentRenderResultSchema.Type;

/** Render one catalog runtime without modifying membership, canonical content, or projections. */
export const RenderSubagent = {
  query: Effect.fn("RenderSubagent.query")(function* (request: {
    readonly name: string;
    readonly agentId: AgentId;
  }) {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const detail = yield* ShowExtension.query({ type: "subagent", name: request.name });
    const canonical = yield* acceptedCanonicalObservation({ type: "subagent", name: request.name });
    const canonicalPath = Option.flatMap(canonical, (value) =>
      Option.fromUndefinedOr(value.observation.path),
    );
    if (Option.isNone(canonicalPath)) {
      return yield* new WorkspaceInspectionFailed({
        category: "validation",
        detail: `Canonical subagent ${request.name} is unavailable`,
      });
    }
    const packageRoot = path.resolve(location.baseDir, canonicalPath.value);
    const pkg = yield* loadSubagentPackage(packageRoot).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceInspectionFailed({ category: "validation", detail: cause.detail, cause }),
      ),
    );
    const fqn = `${pkg.manifest.owner}/subagents/${pkg.manifest.name}`;
    const compiled = compileSubagentImplementation({
      package: pkg,
      agentId: request.agentId,
      managedFile: {
        ext: fqn,
        source: {
          kind: detail.item.source === "workspace" ? "workspace-authored" : "acquired",
          path: path.relative(location.baseDir, path.join(packageRoot, "subagent.json")),
        },
      },
    });
    const common = {
      type: "subagent" as const,
      version: pkg.manifest.version,
      enabled: detail.item.enabled,
      locked: detail.item.locked,
      name: request.name,
      fqn,
      source: detail.item.source,
      scope: location.scope,
      agentId: request.agentId,
      sourceDependencies: compiled.sourceDependencies,
    };
    if (compiled._tag === "Unsupported") {
      return {
        ...common,
        status: "unsupported",
        ...(compiled.mode === undefined ? {} : { mode: compiled.mode }),
        reasonCode: compiled.reasonCode,
        reason: compiled.reason,
        artifacts: [],
        qualifications: [],
      } satisfies SubagentRenderResult;
    }
    if (!isConfigurableAgentId(request.agentId)) {
      return yield* new WorkspaceInspectionFailed({
        category: "validation",
        detail: "Compiled runtime has no configurable native placement",
      });
    }
    const agent = yield* (yield* CodingAgentRepository).get(request.agentId);
    const placement = yield* agent
      .resolveEffectiveSubagentsDir({ workspaceRoot: location.baseDir, scope: location.scope })
      .pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceInspectionFailed({
              category: "validation",
              detail: "Native subagent placement could not be resolved",
              cause,
            }),
        ),
      );
    if (placement._tag !== "supported") {
      return {
        ...common,
        status: "unsupported",
        mode: compiled.mode,
        nativeName: compiled.nativeName,
        reasonCode: `subagent-placement-${placement._tag}`,
        reason: placement.reason,
        artifacts: [],
        qualifications: compiled.qualifications,
      } satisfies SubagentRenderResult;
    }
    return {
      ...common,
      status: "rendered",
      mode: compiled.mode,
      nativeName: compiled.nativeName,
      artifacts: compiled.outputs.map((output) => ({
        path: path.relative(location.baseDir, path.join(placement.dir, output.path)),
        content: output.content,
      })),
      qualifications: [...compiled.qualifications, ...placement.warnings],
    } satisfies SubagentRenderResult;
  }),
};
