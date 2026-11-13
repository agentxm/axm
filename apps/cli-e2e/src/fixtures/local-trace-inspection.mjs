// The E2E process consumes the built public runtime contract, like the other
// distribution fixtures in this directory. The test process imports no app.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as Effect from "effect/Effect";
import {
  inspectLocalTrace,
  traceRetrievalColumns,
} from "../../../cli/dist/src/machine-output-api.js";

const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const flatten = (node) =>
  record(node)
    ? [node, ...(Array.isArray(node.children) ? node.children.flatMap(flatten) : [])]
    : [];
const program = Effect.gen(function* () {
  const [, , action, receiptPath, treePath, expectedPath, mutation] = process.argv;
  if (action === "columns") return traceRetrievalColumns;
  const receipt = read(receiptPath);
  const tree = read(treePath);
  const expected = read(expectedPath);
  const nodes = flatten(tree.root);
  const spans = nodes.filter((span) => span.type === "span");
  const logs = nodes.filter((node) => node.type === "log" && node.message === "axm.work.summary");
  const attributes = (properties, prefix = "") =>
    Object.entries(properties).flatMap(([key, value]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return record(value) ? attributes(value, name) : [[name, value]];
    });
  const attestAggregates = () => {
    receipt.aggregateEventCount = logs.length;
    receipt.aggregateEventsSha256 = createHash("sha256")
      .update(
        logs
          .map((log) =>
            JSON.stringify([
              "axm.work.summary",
              attributes(log.columns["@Properties"]).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
              ),
            ]),
          )
          .sort()
          .join("\n"),
      )
      .digest("hex");
  };
  if (mutation === "truncate") {
    const parent = spans.find((span) => Array.isArray(span.children) && span.children.length > 0);
    if (!parent) throw new Error("No subtree to truncate");
    parent.children.pop();
  } else if (
    mutation === "duplicate-work" ||
    mutation === "missing-owner" ||
    mutation === "wrong-owner"
  ) {
    const summary = logs.find(
      (log) => log.columns?.["@Properties"]?.axm?.summary?.kind === "axm.http.request",
    );
    if (!summary) throw new Error("No physical HTTP summary to mutate");
    const axm = summary.columns["@Properties"].axm;
    if (mutation === "missing-owner") axm.summary.owner = "ffffffffffffffff";
    else if (mutation === "wrong-owner") {
      const parent = spans.find((span) => span.children?.includes(summary));
      const root = spans.find((span) => span.spanId === receipt.spanId);
      if (!parent || !root) throw new Error("Missing aggregate owner");
      parent.children.splice(parent.children.indexOf(summary), 1);
      root.children.push(summary);
      summary.spanId = receipt.spanId;
      axm.summary.owner = receipt.spanId;
      attestAggregates();
    } else {
      axm.summary.count += 1;
      axm.summary["duration-measured"] += 1;
      axm.work.executed += 1;
      const cover = (object) => {
        for (const [key, value] of Object.entries(object)) {
          if (record(value)) cover(value);
          else object[key] = value + 1;
        }
      };
      cover(axm.measured);
      attestAggregates();
    }
  } else if (mutation === "duplicate-wait") {
    const wait = spans.find((span) => span.message === "axm.auth.poll-wait");
    const parent = spans.find((span) => span.spanId === wait?.parentSpanId);
    if (!wait || !parent) throw new Error("No polling wait to duplicate");
    const duplicate = structuredClone(wait);
    duplicate.spanId = "ffffffffffffffff";
    duplicate.children = [];
    parent.children.push(duplicate);
    // Model internally consistent but incorrect instrumentation: the external
    // fixture count must reject it even when producer/receiver hashes agree.
    const ids = [...spans.map((span) => span.spanId), duplicate.spanId].sort();
    receipt.retainedSpanCount += 1;
    receipt.spanIdsSha256 = createHash("sha256").update(ids.join("\n")).digest("hex");
  } else if (mutation !== "none") throw new Error("Unknown controlled mutation");
  return yield* inspectLocalTrace(receipt, tree, { expected });
});

const result = await Effect.runPromiseExit(program);
if (result._tag === "Success") process.stdout.write(JSON.stringify(result.value) + "\n");
else {
  process.exitCode = 1;
  const failures = result.cause.reasons.filter((reason) => reason._tag === "Fail");
  const error = failures[0]?.error;
  process.stdout.write(
    JSON.stringify({ evidence: "failed", code: record(error) ? error.code : "fixture-failure" }) +
      "\n",
  );
}
