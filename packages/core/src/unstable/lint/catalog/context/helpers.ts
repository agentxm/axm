import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  commentStyleForTarget,
  parseRegionMarker,
  type FileCommentStyle,
} from "../../../context/markers.js";
import {
  ContextManifestSchema,
  type FileContentSource,
  type ContextManifest,
} from "../../../context/manifest-schema.js";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryFinding, Severity } from "../../rule.js";

export const CONTEXT_JSON = "context.json";
export const SRC_ROOT = "src";

const decoder = new TextDecoder();

export const decodeContextManifest = (input: unknown): Option.Option<ContextManifest> => {
  const result = Schema.decodeUnknownResult(ContextManifestSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

export const sourcePaths = (
  source: Extract<FileContentSource, { readonly kind: "static" | "template" }>,
): ReadonlyArray<string> => (typeof source.path === "string" ? [source.path] : source.path);

export const srcPath = (payloadPath: string): string => `${SRC_ROOT}/${payloadPath}`;

export const advisory = (
  ruleId: string,
  severity: Severity,
  message: string,
  file: string = CONTEXT_JSON,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId,
  severity,
  message,
  location: { file },
});

export const readPayloadString = (
  context: ContextRuleContext,
  payloadPath: string,
): Effect.Effect<Option.Option<string>> =>
  context.files.readBytes(srcPath(payloadPath)).pipe(
    Effect.map((bytes) => Option.some(decoder.decode(bytes))),
    Effect.catch(() => Effect.succeed(Option.none())),
  );

export const isUnsafeWorkspaceTarget = (target: string): boolean => {
  if (
    target === "" ||
    /^[a-z]:[\\/]/i.test(target) ||
    target.startsWith("/") ||
    target.startsWith("\\")
  ) {
    return true;
  }
  const normalized = target.replace(/\\/g, "/");
  return (
    normalized.split("/").some((segment) => segment === "..") || normalized.startsWith(".axm/")
  );
};

export const markerStyleForTarget = (target: string): Option.Option<FileCommentStyle> =>
  commentStyleForTarget(target);

export const containsAxmRegionMarker = (content: string, target: string): boolean => {
  const style = markerStyleForTarget(target);
  if (Option.isNone(style)) {
    return /axm:(?:start|end)\b/.test(content);
  }
  return content.split(/\r?\n/).some((line) => Option.isSome(parseRegionMarker(line, style.value)));
};
