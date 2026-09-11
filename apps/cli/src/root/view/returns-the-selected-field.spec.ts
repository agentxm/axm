import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import { VIEW_FIELDS } from "@agentxm/workspace-inspection";

import { getAppError } from "../../test-support/test-helpers.js";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../test-support/read-harness.js";
import { handleView } from "./handler.js";

export const specification = defineSpecification({
  requirement: "cli/view/returns-the-selected-field",
  title: "View can return one selected metadata field",
  statement:
    "When a caller selects a supported extension metadata field, AXM shall return that field's bare value alone in its machine result; when the selected field is not a reportable field, or the extension carries no value for it, AXM shall refuse the request without emitting a successful result.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["apps/cli/src/root/view/handler.ts", "cli/view/reports-missing-targets-and-fields"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const HANDLE = "@acme/skills/review";

const deprecation = {
  deprecatedAt: "2026-03-01T00:00:00.000Z",
  message: "Use the replacement when available.",
  replacement: { status: "available", fqn: "@acme/skills/replacement" },
} as const;

/**
 * One reportable value per selected field. Every field AXM reports on its own
 * has a row here; the completeness check below fails if the product gains one
 * this table does not settle.
 */
const selections = [
  { field: "version", value: "1.1.0" },
  { field: "latest", value: "1.1.0" },
  { field: "versions", value: ["1.1.0", "1.0.0"] },
  { field: "description", value: "Review guidance" },
  { field: "owner", value: "@acme" },
  { field: "type", value: "skill" },
  { field: "visibility", value: "public" },
  { field: "deprecation", value: null },
] as const;

/** The two ways a selected field has nothing to return. */
const refusals = [
  {
    label: "a field AXM does not report",
    field: "unsupported",
    index: readExtensionIndex,
    code: "not_found",
    detail: "Unknown view field: unsupported",
  },
  {
    label: "a reportable field the extension has no value for",
    field: "version",
    index: { ...readExtensionIndex, versions: [] },
    code: "validation",
    detail: 'Field "version" is not available',
  },
] as const;

describe("Selected metadata field", () => {
  it("covers every field AXM reports on its own", () => {
    expect(selections.map((selection) => selection.field).sort()).toEqual([...VIEW_FIELDS].sort());
  });

  for (const selection of selections)
    it.effect(`${selection.field} is returned as its bare value`, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({
            handle: HANDLE,
            field: Option.some(selection.field),
            registry: Option.none(),
          });

          expect(workspace.rendererState.results).toHaveLength(1);
          expect(workspace.rendererState.results[0]?.data).toEqual(selection.value);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: readExtensionIndex }),
      );
    });

  it.effect("deprecation returns the deprecation view of a deprecated extension", () => {
    const workspace = makeReadSpecWorkspace();
    return workspace.withRegistry(
      Effect.gen(function* () {
        yield* handleView({
          handle: HANDLE,
          field: Option.some("deprecation"),
          registry: Option.none(),
        });

        expect(workspace.rendererState.results).toHaveLength(1);
        expect(workspace.rendererState.results[0]?.data).toMatchObject({
          message: deprecation.message,
          replacement: deprecation.replacement,
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({ body: { ...readExtensionIndex, deprecation } }),
    );
  });

  for (const refusal of refusals)
    it.effect(`refuses ${refusal.label} without a successful result`, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.withRegistry(
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            handleView({
              handle: HANDLE,
              field: Option.some(refusal.field),
              registry: Option.none(),
            }),
          );

          const error = getAppError(failure);
          expect(error.code).toBe(refusal.code);
          expect(error.detail).toContain(refusal.detail);
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: refusal.index }),
      );
    });
});
