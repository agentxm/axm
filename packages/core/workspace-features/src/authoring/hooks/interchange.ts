/** Bounded native command bundles. No hook body is executed during conversion. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { createHash } from "node:crypto";
import { AGENTS_BY_ID, installable } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  HookManifestSchema,
  HookPackagePathSchema,
  type HookBinding,
  type HookImplementation,
  type HookManifest,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { renderNativeHookGroup } from "@agentxm/workspace-kernel/agent-adapters";
import { AuthoringFailed } from "../errors.js";

export const NATIVE_HOOK_BUNDLE_CONFIG = "hooks.json";
export const NATIVE_HOOK_BUNDLE_METADATA = "hook-bundle.json";
const MAX_RESOURCE_BYTES = 256 * 1024 * 1024;
const MAX_RESOURCE_FILES = 10_000;
const safe = (detail: string) => new AuthoringFailed({ category: "validation", detail });
const NativeCommandSchema = Schema.Struct({
  type: Schema.optional(Schema.Literal("command")),
  command: Schema.NonEmptyString,
  name: Schema.optional(Schema.NonEmptyString),
  timeout: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
});
const NativeGroupSchema = Schema.Struct({
  matcher: Schema.optional(Schema.NonEmptyString),
  hooks: Schema.NonEmptyArray(NativeCommandSchema),
});
const NativeFlatCommandSchema = Schema.Struct({
  ...NativeCommandSchema.fields,
  matcher: Schema.optional(Schema.NonEmptyString),
});
const GroupedDocumentSchema = Schema.Struct({
  hooks: Schema.Record(Schema.NonEmptyString, Schema.Array(NativeGroupSchema)),
});
const FlatDocumentSchema = Schema.Struct({
  version: Schema.Literal(1),
  hooks: Schema.Record(Schema.NonEmptyString, Schema.Array(NativeFlatCommandSchema)),
});
const BundleMetadataSchema = Schema.Struct({
  format: Schema.Literal("axm-native-hook-bundle"),
  version: Schema.Literal(1),
  protocol: Schema.String,
  resources: Schema.Array(HookPackagePathSchema).check(Schema.isUnique()),
  source: Schema.optional(
    Schema.Struct({ fqn: Schema.String, version: Schema.String, implementation: Schema.String }),
  ),
  executionRoot: Schema.Literal("bundle-root"),
});

const decode = <A, I>(schema: Schema.Codec<A, I>, input: unknown, detail: string) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => safe(detail)),
  );

const dialectFor = (protocol: ConfigurableAgentId) => {
  const hook = AGENTS_BY_ID[protocol].capabilities.hook;
  return "entryDialect" in hook.native && hook.axm.writer !== null
    ? hook.native.entryDialect
    : null;
};

/** Accept literal tokens only. This deliberately does not parse shell expressions. */
const commandHandler = (native: typeof NativeCommandSchema.Type, protocol: ConfigurableAgentId) =>
  Effect.gen(function* () {
    if (
      !/^(?:'[^'\r\n]*'|[a-zA-Z0-9_./:@+-]+)(?: (?:'[^'\r\n]*'|[a-zA-Z0-9_./:@+-]+))*$/.test(
        native.command,
      )
    )
      return yield* safe(
        "Native import accepts literal command tokens only; inline shell, expansion, environment assignments, and plugin variables require authoring a Hook implementation explicitly.",
      );
    const tokens = [...native.command.matchAll(/'([^']*)'|([a-zA-Z0-9_./:@+-]+)/g)].map(
      (match) => match[1] ?? match[2] ?? "",
    );
    const [executable, entrypoint, ...args] = tokens;
    if (executable === undefined || entrypoint === undefined)
      return yield* safe(
        "Native import requires bash, node, or python3 followed by a safe relative script path.",
      );
    yield* decode(
      HookPackagePathSchema,
      entrypoint,
      "Native entrypoint must be a safe package-relative file path.",
    );
    if (executable === "python")
      return yield* safe(
        "Native import requires an explicit python3 interpreter; the version behind python is unknown.",
      );
    const runtime = executable === "python3" ? "python" : executable;
    if (runtime !== "bash" && runtime !== "node" && runtime !== "python")
      return yield* safe("Unsupported native interpreter.");
    const dialect = dialectFor(protocol);
    if (dialect === null)
      return yield* safe(`No native command writer is available for ${protocol}.`);
    if (native.name !== undefined && dialect.commandNameSerialization !== "manifest")
      return yield* safe("The selected native protocol does not preserve a command name field.");
    const timeoutMs =
      native.timeout === undefined
        ? undefined
        : native.timeout * (dialect.timeoutSerialization === "seconds" ? 1000 : 1);
    if (timeoutMs !== undefined && !Number.isSafeInteger(timeoutMs))
      return yield* safe("Native timeout cannot be represented exactly in milliseconds.");
    return {
      type: "command" as const,
      runtime,
      entrypoint,
      ...(args.length === 0 ? {} : { args }),
      ...(native.name === undefined ? {} : { name: native.name }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    } satisfies HookBinding["handler"];
  });

export const parseNativeHookDocument = Effect.fn("Hook.parseNativeDocument")(function* (
  input: unknown,
  protocol: ConfigurableAgentId,
) {
  const dialect = dialectFor(protocol);
  if (dialect === null)
    return yield* safe(`No native command writer is available for ${protocol}.`);
  const bindings: Array<HookBinding> = [];
  const append = Effect.fn(function* (
    event: string,
    matcher: string | undefined,
    native: typeof NativeCommandSchema.Type,
  ) {
    const binding = {
      id: `binding-${bindings.length + 1}`,
      event,
      ...(matcher === undefined ? {} : { matcher }),
      handler: yield* commandHandler(native, protocol),
    };
    const verdict = installable(AGENTS_BY_ID[protocol], binding);
    if (!verdict.installable) return yield* safe(verdict.reason);
    bindings.push(binding);
  });
  if (dialect.serializer === "flat-command-stdin") {
    const document = yield* decode(
      FlatDocumentSchema,
      input,
      "Unsupported native Hook document; Cursor bundles require version 1 and flat command arrays, with no additional native options.",
    );
    for (const [event, entries] of Object.entries(document.hooks))
      for (const entry of entries) yield* append(event, entry.matcher, entry);
  } else {
    const document = yield* decode(
      GroupedDocumentSchema,
      input,
      "Unsupported native Hook document; this bundle accepts grouped command hooks only, with no additional native options.",
    );
    for (const [event, groups] of Object.entries(document.hooks))
      for (const group of groups)
        for (const entry of group.hooks) yield* append(event, group.matcher, entry);
  }
  if (bindings.length === 0)
    return yield* safe("Native Hook document contains no supported command bindings.");
  return yield* decode(
    HookManifestSchema,
    {
      owner: "@native",
      name: "imported",
      type: "hook",
      version: "0.1.0",
      implementations: [{ id: protocol, protocol, bindings }],
    },
    "Native Hook definitions cannot form a valid package.",
  ).pipe(Effect.map((manifest) => manifest.implementations[0]));
});

export interface NativeHookBundle {
  readonly manifest: HookManifest;
  readonly files: ReadonlyArray<{ readonly path: string; readonly bytes: Uint8Array }>;
}

/** Read an explicit resource closure, refusing links that escape the bundle root. */
export const readHookResources = Effect.fn("Hook.readBundleResources")(function* (
  root: string,
  resources: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realRoot = yield* fs.realPath(root);
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  let bytes = 0;
  if (resources.length > MAX_RESOURCE_FILES)
    return yield* safe("Hook resource closure exceeds the package file limit.");
  for (const relative of [...new Set(resources)]) {
    yield* decode(
      HookPackagePathSchema,
      relative,
      "Hook resources must use safe package-relative paths.",
    );
    if (["hook.json", NATIVE_HOOK_BUNDLE_CONFIG, NATIVE_HOOK_BUNDLE_METADATA].includes(relative))
      return yield* safe(`Resource path is reserved by the native bundle: ${relative}.`);
    const absolute = yield* fs.realPath(path.resolve(realRoot, relative));
    const contained = path.relative(realRoot, absolute);
    if (contained === ".." || contained.startsWith(`..${path.sep}`) || path.isAbsolute(contained))
      return yield* safe(`Hook resource escapes its source package: ${relative}.`);
    const info = yield* fs.stat(absolute);
    if (info.type !== "File")
      return yield* safe(`Hook resources must be regular files: ${relative}.`);
    bytes += Number(info.size);
    if (bytes > MAX_RESOURCE_BYTES)
      return yield* safe("Hook resource closure exceeds the package byte limit.");
    files.push({ path: relative, bytes: yield* fs.readFile(absolute) });
  }
  return files;
});

export const prepareNativeHookImport = Effect.fn("Hook.prepareNativeImport")(function* (args: {
  readonly source: string;
  readonly target: ExtensionFqnParts;
  readonly protocol: ConfigurableAgentId;
  readonly configPath?: string;
  readonly resources?: ReadonlyArray<string>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(path.resolve(args.source));
  const configPath = args.configPath ?? NATIVE_HOOK_BUNDLE_CONFIG;
  yield* decode(
    HookPackagePathSchema,
    configPath,
    "Native config must be a safe path relative to its bundle directory.",
  );
  const configReal = yield* fs.realPath(path.resolve(root, configPath));
  const relative = path.relative(root, configReal);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return yield* safe("Native config escapes its bundle directory.");
  const configText = yield* fs.readFileString(configReal);
  const input = yield* decode(
    Schema.fromJsonString(Schema.Unknown),
    configText,
    "Native Hook config must contain JSON.",
  );
  const implementation = yield* parseNativeHookDocument(input, args.protocol);
  const resources = [...(args.resources ?? [])];
  const metadataPath = path.join(root, NATIVE_HOOK_BUNDLE_METADATA);
  let source: typeof BundleMetadataSchema.Type.source;
  if (yield* fs.exists(metadataPath)) {
    const metadata = yield* decode(
      Schema.fromJsonString(BundleMetadataSchema),
      yield* fs.readFileString(metadataPath),
      "Invalid native Hook bundle metadata.",
    );
    if (metadata.protocol !== args.protocol)
      return yield* safe("Native bundle protocol does not match --protocol.");
    resources.push(...metadata.resources);
    source = metadata.source;
  }
  const files = yield* readHookResources(root, [
    ...resources,
    ...implementation.bindings.map((binding) => binding.handler.entrypoint),
  ]);
  const manifest = yield* decode(
    HookManifestSchema,
    {
      owner: args.target.owner,
      name: args.target.name,
      type: "hook",
      version: "0.1.0",
      description: `Imported native ${args.protocol} hooks`,
      implementations: [implementation],
      assets: files.map((file) => file.path),
      metadata: {
        nativeImport: {
          protocol: args.protocol,
          config: configPath,
          sha256: createHash("sha256").update(configText).digest("hex"),
          originalRegistrationsPreserved: true,
          ...(source === undefined ? {} : { source }),
        },
      },
    },
    "Imported Hook extension is invalid.",
  );
  return { manifest, files } satisfies NativeHookBundle;
});

export const nativeHookExportDocument = Effect.fn("Hook.exportDocument")(function* (
  manifest: HookManifest,
  implementation: HookImplementation,
) {
  const dialect = dialectFor(implementation.protocol);
  if (dialect === null)
    return yield* safe(`No native writer is available for ${implementation.protocol}.`);
  if (Object.keys(manifest.configuration ?? {}).length > 0)
    return yield* safe(
      "Native export currently requires a package without consumer configuration; provide a self-contained implementation before export.",
    );
  const hooks: Record<string, Array<Record<string, unknown>>> = {};
  for (const binding of implementation.bindings) {
    const verdict = installable(AGENTS_BY_ID[implementation.protocol], binding);
    if (!verdict.installable) return yield* safe(verdict.reason);
    if (
      Object.keys(binding.handler.env ?? {}).length > 0 ||
      !/^[a-zA-Z0-9_./-]+$/.test(binding.handler.entrypoint)
    )
      return yield* safe(
        "Native export accepts relative script commands without environment bindings or shell-sensitive path characters.",
      );
    const args: Array<string> = [];
    for (const value of binding.handler.args ?? []) {
      if (
        typeof value !== "string" ||
        /['\r\n]|(?:^|[=\s])(?:\/|~[/\\]|[a-zA-Z]:[/\\])/.test(value)
      )
        return yield* safe(
          "Native export accepts literal arguments without absolute workstation paths, single quotes, or newlines; configuration and environment references remain private.",
        );
      args.push(`'${value}'`);
    }
    const command = [
      binding.handler.runtime === "python" ? "python3" : binding.handler.runtime,
      binding.handler.entrypoint,
      ...args,
    ].join(" ");
    const rendered = renderNativeHookGroup(dialect, {
      command,
      ...(binding.matcher === undefined ? {} : { matcher: binding.matcher }),
      ...(binding.handler.timeoutMs === undefined ? {} : { timeoutMs: binding.handler.timeoutMs }),
      name: binding.handler.name ?? manifest.name,
    });
    const current = hooks[binding.event] ?? [];
    current.push(rendered);
    hooks[binding.event] = current;
  }
  return dialect.serializer === "flat-command-stdin" ? { version: 1, hooks } : { hooks };
});

export const nativeHookBundleMetadata = (
  manifest: HookManifest,
  implementation: HookImplementation,
  resources: ReadonlyArray<string>,
) => ({
  format: "axm-native-hook-bundle",
  version: 1,
  protocol: implementation.protocol,
  executionRoot: "bundle-root",
  resources,
  source: {
    fqn: `${manifest.owner}/hooks/${manifest.name}`,
    version: manifest.version,
    implementation: implementation.id,
  },
});

export const writeNativeHookImport = Effect.fn("Hook.writePreparedImport")(function* (
  targetDir: string,
  bundle: NativeHookBundle,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const file of bundle.files) {
    const destination = path.join(targetDir, file.path);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
    yield* fs.writeFile(destination, file.bytes);
  }
  yield* fs.writeFileString(
    path.join(targetDir, "hook.json"),
    `${JSON.stringify(bundle.manifest, null, 2)}\n`,
  );
});
