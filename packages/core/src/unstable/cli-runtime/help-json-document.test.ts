import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { describe, expect, it } from "vitest";
import {
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  makeJsonVersionDoc,
  toJsonHelpDoc,
} from "./help-json-document.js";

const makeHelpDoc = (overrides: Partial<HelpDoc> = {}): HelpDoc => ({
  description: "Manage skills",
  usage: "axm skills [flags]",
  flags: [],
  annotations: ServiceMap.empty(),
  ...overrides,
});

describe("help JSON document contract", () => {
  it("maps Effect help docs to the public JSON help document", () => {
    const doc = makeHelpDoc({
      flags: [
        {
          name: "json",
          aliases: ["j"],
          type: "boolean",
          required: false,
          description: Option.some("Emit JSON"),
        },
      ],
      args: [
        {
          name: "name",
          type: "text",
          required: true,
          variadic: false,
          description: Option.none(),
        },
      ],
      subcommands: [
        {
          group: "MANAGE",
          commands: [
            {
              name: "install",
              alias: "i",
              shortDescription: "Install a skill",
              description: "Install a skill from a source.",
            },
          ],
        },
      ],
      examples: [{ command: "axm skills install @acme/skills/review" }],
    });

    const encoded = Schema.encodeSync(JsonHelpDocSchema)(
      toJsonHelpDoc(doc, { learnMore: "LEARN MORE\n  axm help skills" }),
    );

    expect(encoded).toEqual({
      type: "help",
      description: "Manage skills",
      usage: "axm skills [flags]",
      flags: [
        {
          name: "json",
          aliases: ["j"],
          type: "boolean",
          required: false,
          description: "Emit JSON",
        },
      ],
      args: [
        {
          name: "name",
          type: "text",
          required: true,
          variadic: false,
          description: undefined,
        },
      ],
      subcommands: [
        {
          group: "MANAGE",
          commands: [
            {
              name: "install",
              alias: "i",
              shortDescription: "Install a skill",
              description: "Install a skill from a source.",
            },
          ],
        },
      ],
      examples: [
        {
          command: "axm skills install @acme/skills/review",
          description: undefined,
        },
      ],
      learnMore: "LEARN MORE\n  axm help skills",
    });
  });

  it("omits empty learn-more values and encodes version documents", () => {
    expect(Schema.encodeSync(JsonHelpDocSchema)(toJsonHelpDoc(makeHelpDoc()))).toEqual({
      type: "help",
      description: "Manage skills",
      usage: "axm skills [flags]",
      flags: [],
      globalFlags: undefined,
      args: undefined,
      subcommands: undefined,
      examples: undefined,
      learnMore: undefined,
    });

    expect(Schema.encodeSync(JsonVersionDocSchema)(makeJsonVersionDoc("axm", "1.2.3"))).toEqual({
      type: "version",
      name: "axm",
      version: "1.2.3",
    });
  });
});
