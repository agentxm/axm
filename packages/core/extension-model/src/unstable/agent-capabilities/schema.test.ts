import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  HooksExtensionCapabilitySchema,
  McpExtensionCapabilitySchema,
  NativeReadLocationSchema,
} from "./schema.js";

describe("native reader location schema", () => {
  const decodeLocation = Schema.decodeUnknownSync(NativeReadLocationSchema, {
    onExcessProperty: "error",
  });
  const location = {
    scope: "project",
    root: "project",
    path: ".agents/skills",
    shape: "directory",
    role: "primary",
    status: "canonical",
    applicability: { kind: "always" },
    provenance: { kind: "capability-sources" },
  };
  it("retains explicit scope, root, shape, applicability, and provenance", () => {
    expect(decodeLocation(location)).toEqual(location);
    const conditional = {
      ...location,
      scope: "user",
      root: "xdg-config",
      path: "agent/skills",
      role: "additional",
      status: "compat",
      applicability: { kind: "conditional", condition: "compatibility lookup enabled" },
      provenance: { kind: "sources", sources: ["https://example.com/native-paths"] },
    };
    expect(decodeLocation(conditional)).toEqual(conditional);
  });
  it("requires condition text and explicit evidence on conditional reader claims", () => {
    expect(() => decodeLocation({ ...location, applicability: { kind: "conditional" } })).toThrow(
      "condition",
    );
    expect(() =>
      decodeLocation({ ...location, provenance: { kind: "sources", sources: [] } }),
    ).toThrow();
    expect(() => decodeLocation({ ...location, root: undefined })).toThrow("root");
    expect(() => decodeLocation({ ...location, status: "legacy" })).toThrow("status");
  });
  it("refuses cross-scope roots and escaping path spellings", () => {
    expect(() => decodeLocation({ ...location, root: "home" })).toThrow("root");
    expect(() => decodeLocation({ ...location, scope: "user" })).toThrow("root");
    for (const path of [
      "/outside",
      "\\outside",
      "~/.skills",
      "C:\\skills",
      "C:skills",
      "../skills",
      "native/../../skills",
      "native\\..\\skills",
    ]) {
      expect(() => decodeLocation({ ...location, path })).toThrow("path");
    }
    expect(() => decodeLocation({ ...location, configRootRelativePath: "skills" })).toThrow(
      "configRootRelativePath",
    );
    expect(() =>
      decodeLocation({
        ...location,
        scope: "user",
        root: "home",
        configRootRelativePath: "../skills",
      }),
    ).toThrow("configRootRelativePath");
  });
});
const decodeMcpCapability = Schema.decodeUnknownSync(McpExtensionCapabilitySchema);
const decodeHooksCapability = Schema.decodeUnknownSync(HooksExtensionCapabilitySchema);
const activeMcpCapability = {
  native: {
    availability: { via: "native" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: ["https://example.com/mcp"],
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "vendor",
    transports: ["stdio", "http"],

    locations: [
      {
        id: "project-0",
        scope: "project",
        root: "project",
        path: ".mcp.json",
        shape: "file",
        role: "primary",
        status: "canonical",
        applicability: { kind: "always" },
        provenance: { kind: "capability-sources" },
        format: "json",
        attribution: "shared",
        keyPath: ["mcpServers"],
      },
    ],

    entryDialect: {
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
      stdio: {
        typeField: { required: null, accepted: [null] },
        command: "split",
        envKey: "env",
      },
      remote: {
        typeField: {
          required: {
            name: "type",
            value: { "streamable-http": "http" },
          },
          accepted: [
            {
              name: "type",
              value: { "streamable-http": "http" },
            },
          ],
        },
        urlKey: { "streamable-http": "url" },
        headersKey: "headers",
      },
    },
  },
  axm: {
    status: "supported",
    lastVerified: "2026-06-05",
    writer: {
      config: {
        locationIds: ["project-0"],
      },
    },
  },
};
describe("MCP capability schema", () => {
  it("preserves a native config reader independently of writer support", () => {
    expect(
      decodeMcpCapability({
        ...activeMcpCapability,
        axm: {
          status: "unsupported",
          writer: null,
          lastVerified: null,
          reason: "No safe native writer yet.",
        },
      }).native,
    ).toMatchObject({ locations: activeMcpCapability.native.locations });
  });
  it("rejects contradictory writer references and absent native container paths", () => {
    const writer = activeMcpCapability.axm.writer;
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        axm: {
          ...activeMcpCapability.axm,
          writer: { config: { ...writer.config, locationIds: ["missing"] } },
        },
      }),
    ).toThrow("declared native config location ids");
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        native: {
          ...activeMcpCapability.native,
          locations: [
            ...activeMcpCapability.native.locations,
            ...activeMcpCapability.native.locations,
          ],
        },
      }),
    ).toThrow("unique");
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        native: {
          ...activeMcpCapability.native,
          locations: activeMcpCapability.native.locations.map((location) => ({
            ...location,
            keyPath: undefined,
          })),
        },
      }),
    ).toThrow("keyPath");
  });
  it("accepts full nested MCP paths and rejects empty containers", () => {
    const nested = {
      ...activeMcpCapability,
      native: {
        ...activeMcpCapability.native,
        locations: activeMcpCapability.native.locations.map((location) => ({
          ...location,
          keyPath: ["mcp", "servers"],
        })),
      },
    };
    expect(decodeMcpCapability(nested).native).toMatchObject({
      locations: [expect.objectContaining({ keyPath: ["mcp", "servers"] })],
    });
    expect(() =>
      decodeMcpCapability({
        ...nested,
        native: {
          ...nested.native,
          locations: nested.native.locations.map((location) => ({ ...location, keyPath: [] })),
        },
      }),
    ).toThrow();
  });

  it("requires explicit attribution on every config target", () => {
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        native: {
          ...activeMcpCapability.native,
          locations: activeMcpCapability.native.locations.map((location) => ({
            ...location,
            attribution: undefined,
          })),
        },
      }),
    ).toThrow("attribution");
  });

  it("allows non-full active MCP capabilities to carry writer config", () => {
    for (const standardsCompliance of ["parity", "partial", "none"] as const) {
      expect(
        decodeMcpCapability({
          ...activeMcpCapability,
          native: {
            ...activeMcpCapability.native,
            standardsCompliance,
          },
        }),
      ).toMatchObject({
        native: { standardsCompliance },
        axm: { writer: { config: { locationIds: ["project-0"] } } },
      });
    }
  });
  it("allows supported MCP capabilities to omit writer config", () => {
    expect(
      decodeMcpCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: "UI-only surface; no writable MCP config file.",
          docs: [],
          sources: ["https://example.com/mcp"],
          scopes: ["project"],
          standardsCompliance: "none",
          convention: "vendor",
          transports: ["http"],

          locations: [],

          entryDialect: null,
        },
        axm: {
          status: "supported",
          lastVerified: "2026-06-05",
          writer: null,
        },
      }),
    ).toMatchObject({
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        standardsCompliance: "none",
      },
      axm: {
        status: "supported",
        writer: null,
      },
    });
  });
  it("requires a verified native dialect for every selected writer", () => {
    for (const [field, message] of [
      ["stdio", "MCP stdio config"],
      ["remote", "MCP remote config"],
    ] as const) {
      expect(() =>
        decodeMcpCapability({
          ...activeMcpCapability,
          native: {
            ...activeMcpCapability.native,
            entryDialect: { ...activeMcpCapability.native.entryDialect, [field]: null },
          },
        }),
      ).toThrow(message);
    }
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        native: { ...activeMcpCapability.native, entryDialect: null },
      }),
    ).toThrow("requires a verified native entry dialect");
  });
});

describe("Hooks capability schema", () => {
  it("requires native tool mapping names to be unique", () => {
    expect(() =>
      decodeHooksCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: null,
          docs: [],
          sources: ["https://example.com/hooks"],
          scopes: ["project"],
          mechanism: ["command-stdin"],
          locations: [],
          events: [
            {
              nativeName: "PreToolUse",
              canonical: "tool.pre",
              matcher: { kind: "regex", example: "Write", notes: null },
              decision: [{ kind: "observe" }],
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
          ],
          tools: [
            {
              nativeName: "Write",
              canonical: "file.write",
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
            {
              nativeName: "Write",
              canonical: "file.edit",
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
          ],

          entryDialect: null,
        },
        axm: {
          status: "unsupported",
          writer: null,
          lastVerified: null,
        },
      }),
    ).toThrow("unique nativeName");
  });
  it("allows unmodeled native hook availability with unsupported AXM writer and a reason", () => {
    expect(
      decodeHooksCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: null,
          docs: [],
          sources: ["https://example.com/hooks"],
          scopes: ["project"],
          modeling: "native-unmodeled",
          locations: [],

          entryDialect: null,
        },
        axm: {
          status: "unsupported",
          writer: null,
          lastVerified: null,
          reason: "In-process plugin writers are not implemented.",
        },
      }),
    ).toMatchObject({
      native: { availability: { via: "native" }, modeling: "native-unmodeled", entryDialect: null },
      axm: { writer: null, reason: "In-process plugin writers are not implemented." },
    });
  });
});
