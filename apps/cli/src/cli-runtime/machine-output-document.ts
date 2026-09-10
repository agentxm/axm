import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { JsonEnvelopeSchema } from "./json-envelope.js";
import { JsonHelpDocSchema, JsonVersionDocSchema } from "./json-help-doc.js";

/**
 * Stable identifier for the machine-output contract first shipped by AXM
 * 0.24.3. Consumers detect it from the decoded document shape instead of
 * inferring it from the CLI release number.
 */
export const MACHINE_OUTPUT_CONTRACT_ID = "axm.machine-output/result-envelope-v1";

export const MachineOutputDocumentSchema = Schema.Union([
  JsonEnvelopeSchema,
  JsonHelpDocSchema,
  JsonVersionDocSchema,
]).annotate({
  identifier: "MachineOutputDocument",
  title: "AXM Machine Output Document",
  description:
    "One ordinary result or error envelope, or a formatter-owned help or version document.",
});
export type MachineOutputDocument = typeof MachineOutputDocumentSchema.Type;

export const MachineOutputDocumentKindSchema = Schema.Literals([
  "result-envelope-v1",
  "error-envelope-v1",
  "help-document-v1",
  "version-document-v1",
] as const);
export type MachineOutputDocumentKind = typeof MachineOutputDocumentKindSchema.Type;

const decodeHelp = Schema.decodeUnknownOption(JsonHelpDocSchema);
const decodeVersion = Schema.decodeUnknownOption(JsonVersionDocSchema);
const decodeEnvelope = Schema.decodeUnknownOption(JsonEnvelopeSchema);

/**
 * Structurally detects the current machine-output contract. `None` means the
 * document is malformed or uses an unsupported flat payload shape.
 */
export const detectMachineOutputDocumentKind = (
  input: unknown,
): Option.Option<MachineOutputDocumentKind> => {
  if (Option.isSome(decodeHelp(input))) return Option.some("help-document-v1");
  if (Option.isSome(decodeVersion(input))) return Option.some("version-document-v1");

  const envelope = decodeEnvelope(input);
  if (Option.isNone(envelope)) return Option.none();
  return Option.some("result" in envelope.value ? "result-envelope-v1" : "error-envelope-v1");
};
