/**
 * Pure text reconciliation for AXM regions inside human-authored files.
 *
 * A region is the opaque body between a name-only open fence and its close
 * fence. The grammar and the byte-level edit live here because they are
 * native format mechanics; which file may carry a region, when it is written,
 * and how the write is protected are projection decisions owned by core.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  isRegionName,
  scanFences,
  serializeFence,
  type FenceLine,
  type FenceSyntax,
  type RegionName,
} from "./region-fences.js";

export type ManagedRegionProblem = "duplicate" | "unpaired" | "nested" | "interleaved";

export type ManagedRegionState =
  | { readonly state: "absent"; readonly reasonCode: "managed-region-absent" }
  | {
      readonly state: "complete";
      readonly reasonCode: "managed-region-complete";
      readonly open: FenceLine;
      readonly close: FenceLine;
      /** Exact bytes between the open fence's terminator and the close fence. */
      readonly body: string;
    }
  | {
      readonly state: "malformed";
      readonly reasonCode: "managed-region-malformed";
      readonly problem: ManagedRegionProblem;
      readonly region: RegionName;
      readonly message: string;
    };

export type WritableManagedRegionState = Exclude<
  ManagedRegionState,
  { readonly state: "malformed" }
>;

const malformed = (region: RegionName, problem: ManagedRegionProblem): ManagedRegionState => ({
  state: "malformed",
  reasonCode: "managed-region-malformed",
  problem,
  region,
  message: `AXM region "${region}" has ${problem} fences`,
});

interface RegionSpan {
  readonly open: FenceLine;
  readonly close: FenceLine;
}

/**
 * Pair every vocabulary fence in the file. Any malformed vocabulary fence
 * blocks every region write in the file, so the first problem is returned.
 */
const pairFences = (
  content: string,
  syntax: FenceSyntax,
):
  | { readonly ok: true; readonly spans: ReadonlyMap<RegionName, RegionSpan> }
  | { readonly ok: false; readonly state: ManagedRegionState } => {
  const spans = new Map<RegionName, RegionSpan>();
  let openFence: { readonly fence: FenceLine; readonly name: RegionName } | undefined;
  for (const fence of scanFences(content, syntax)) {
    const name = fence.name;
    if (!isRegionName(name)) continue;
    if (fence.edge === "open") {
      if (openFence !== undefined)
        return {
          ok: false,
          state: malformed(openFence.name, openFence.name === name ? "nested" : "interleaved"),
        };
      openFence = { fence, name };
      continue;
    }
    if (openFence === undefined) return { ok: false, state: malformed(name, "unpaired") };
    if (openFence.name !== name)
      return { ok: false, state: malformed(openFence.name, "interleaved") };
    if (spans.has(name)) return { ok: false, state: malformed(name, "duplicate") };
    spans.set(name, { open: openFence.fence, close: fence });
    openFence = undefined;
  }
  return openFence === undefined
    ? { ok: true, spans }
    : { ok: false, state: malformed(openFence.name, "unpaired") };
};

/** Inspect one region without guessing through duplicate, nested, interleaved or unpaired fences. */
export const inspectManagedRegion = (
  content: string,
  region: RegionName,
  syntax: FenceSyntax,
): ManagedRegionState => {
  const paired = pairFences(content, syntax);
  if (!paired.ok) return paired.state;
  const span = paired.spans.get(region);
  return span === undefined
    ? { state: "absent", reasonCode: "managed-region-absent" }
    : {
        state: "complete",
        reasonCode: "managed-region-complete",
        open: span.open,
        close: span.close,
        body: content.slice(span.open.end, span.close.start),
      };
};

const detectEol = (content: string): "\r\n" | "\n" => (content.includes("\r\n") ? "\r\n" : "\n");

const terminatorOf = (content: string, fence: FenceLine): string => {
  const line = content.slice(fence.start, fence.end);
  return line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";
};

const terminated = (body: string, eol: string): string => {
  const lines = body.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line) => `${line}${eol}`).join("");
};

/**
 * Render the file with `body` as the region's whole content; an empty body
 * withdraws the region. `None` means there is nothing to write: the region is
 * absent and the body empty. The renderer makes no currency decision; it
 * always writes the canonical fences around the requested body.
 */
export const renderManagedRegion = (args: {
  readonly content: string;
  readonly state: WritableManagedRegionState;
  readonly region: RegionName;
  readonly syntax: FenceSyntax;
  readonly body: string;
}): Option.Option<{ readonly content: string }> => {
  const { content, state } = args;
  const eol = detectEol(content);
  const open = serializeFence(args.region, "open", args.syntax);
  const close = serializeFence(args.region, "close", args.syntax);
  if (args.body.length === 0) {
    return state.state === "absent"
      ? Option.none()
      : Option.some({
          content: content.slice(0, state.open.start) + content.slice(state.close.end),
        });
  }
  const unit = `${open}${eol}${terminated(args.body, eol)}${close}`;
  if (state.state === "absent") {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : eol;
    return Option.some({ content: `${content}${separator}${unit}${eol}` });
  }
  const openTerminator = terminatorOf(content, state.open) || eol;
  const closeTerminator = terminatorOf(content, state.close) || eol;
  return Option.some({
    content:
      content.slice(0, state.open.start) +
      `${open}${openTerminator}${terminated(args.body, eol)}${close}${closeTerminator}` +
      content.slice(state.close.end),
  });
};

/**
 * Post-condition of a region render: the rendered region is complete (or
 * absent after a withdrawal), and every other vocabulary region in the file
 * keeps its state. A body that would break the fences, such as one that opens
 * an unclosed code block, fails here instead of being written.
 */
export const verifyRenderedRegion = (args: {
  readonly before: string;
  readonly after: string;
  readonly region: RegionName;
  readonly syntax: FenceSyntax;
  readonly withdrawn: boolean;
}): Result.Result<WritableManagedRegionState, string> => {
  const state = inspectManagedRegion(args.after, args.region, args.syntax);
  const expected = args.withdrawn ? "absent" : "complete";
  if (state.state !== expected)
    return Result.fail(
      state.state === "malformed"
        ? `rendering the region would leave ${state.message}`
        : `rendering the region would leave it ${state.state}`,
    );
  for (const other of [
    ...new Set(
      scanFences(args.before, args.syntax)
        .map((fence) => fence.name)
        .filter(isRegionName),
    ),
  ]) {
    if (other === args.region) continue;
    const prior = inspectManagedRegion(args.before, other, args.syntax);
    const next = inspectManagedRegion(args.after, other, args.syntax);
    if (
      prior.state !== next.state ||
      (prior.state === "complete" && next.state === "complete" && prior.body !== next.body)
    )
      return Result.fail(`rendering the region would change region "${other}"`);
  }
  return Result.succeed(state);
};
