import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import {
  KnowledgeConceptStatusOutputSchema,
  reportKnowledgeCorpusStatus,
} from "@agentxm/knowledge-query";

import { Screen, rawDoc } from "../../../screen/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

export const handleKnowledgeConceptStatus = Effect.fn("Knowledge.concepts.status")(function* () {
  const screen = yield* Screen;
  const output = yield* reportKnowledgeCorpusStatus();
  if (yield* screen.document(output, KnowledgeConceptStatusOutputSchema)) return;
  yield* screen.result(
    rawDoc(
      `Knowledge discovery ${output.capabilities.version}\nStatus   ${output.readiness}\nBundles  ${String(output.bundleCount)}\nConcepts ${String(output.conceptCount)}\n${output.corpusFingerprint === undefined ? "" : `Corpus   ${output.corpusFingerprint}\n`}${output.health.diagnostics.map((diagnostic) => `${sanitizeKnowledgeTerminalText(diagnostic)}\n`).join("")}`,
    ),
  );
});

const statusConfig = { ...scopeConfig } as const;

export const statusCommand = Command.make("status", statusConfig, ({ scope }) =>
  handleKnowledgeConceptStatus().pipe(
    withWorkspace(scope),
    withRuntime("knowledge concepts status"),
  ),
).pipe(
  withArgvTracking(statusConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Report discovery capabilities and selected corpus identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts status",
      description: "Inspect the discovery contract and selected corpus fingerprint",
    },
  ]),
);
