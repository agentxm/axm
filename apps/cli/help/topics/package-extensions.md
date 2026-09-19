# Packages and extensions

AXM links extensions and packages in two directions. Extension authors declare **companion packages**; package authors declare **recommended extensions**; when both sides agree, the extension is **official** for that package.

## Companion packages

Any extension author may declare one or more `packages` on an extension manifest (`skill.json`, `subagent.json`, `pack.json`, etc.) to signal that the extension is designed to work with those packages. Companion packages use [Package URL](https://github.com/package-url/purl-spec) identities, with an optional [VERS](https://github.com/package-url/vers-spec) range when the extension truly depends on a bounded package-version span.

Default to identity-only. The declaration usually means "this extension targets this package," not "this extension is tied to a specific release":

```jsonc
{
  "packages": [{ "purl": "pkg:npm/example-tinyflags" }],
}
```

Use `packages.versionRange` only for a real compatibility constraint. Its VERS scheme must match the purl ecosystem. Do not put `@version` on the purl; that exact pin goes stale on every package release.

## Recommended extensions

Package authors use the portable `agentExtensions` contract v1. Every recommendation has a qualified `ref` and may carry a self-describing `source` locator:

```jsonc
{
  "$schema": "https://axm.sh/schemas/agent-extensions.schema.json",
  "agentExtensions": [
    { "ref": "@agentxm/skills/axm", "versionRange": "^0.31.0" },
    {
      "ref": "@acme/packs/widget-kit",
      "source": {
        "type": "git",
        "url": "https://github.com/acme/widget-kit.git",
        "path": "packs/widget-kit",
        "revision": "v3.2.0",
      },
    },
  ],
}
```

A sourceless entry always means the fixed AgentXM Registry at `https://registry.agentxm.ai`. Consumer settings, including `defaultRegistry`, never redirect it. An explicit Registry source has this form:

```jsonc
{
  "ref": "@acme/skills/review",
  "source": { "type": "registry", "url": "https://registry.example.com" },
  "versionRange": ">=2.0.0 <3.0.0",
}
```

Git sources accept `url` plus optional `path` and `revision`. Path sources use `{ "type": "path", "path": "..." }`. `versionRange` is valid only for a sourceless or explicit Registry entry; Git and path entries select their revision through the locator.

A malformed recommendation is diagnosed and ignored without hiding valid siblings. The former tool-specific metadata shape is not accepted.

Default to identity-only for Registry recommendations. Add a semver `versionRange` only when the package genuinely pairs with a bounded extension release line. Avoid exact pins and `"*"`; an omitted range stays current without needless package republishing.

A recommendation can target any extension type: skill, MCP server, subagent, rule, hook, knowledge bundle, or pack. When recommending several extensions, prefer a pack so package authors can publish one stable reference while the pack evolves.

## Emit metadata from a tagged checkout

`axm share --npm` prints the install command and a package-native metadata snippet for every distributable authored extension at the tag currently checked out. Replace `--npm` with any ecosystem name in the table below. The command refuses an untagged checkout, multiple ecosystem flags, or an extension without a qualified manifest identity. It writes nothing.

## Official extensions

Both declarations are unilateral: any extension author may name a package as a companion, and any package author may recommend an extension. **Official** is the derived signal that both sides agree.

## Ecosystem placements

Use the package format's standard custom-metadata point when it preserves the portable field. Formats that strip custom fields ship `agent-extensions.json` as package data instead.

| Package format                | Metadata location                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Bazel                         | `agent-extensions.json` in package runfiles                                       |
| Cargo (Rust)                  | `package.metadata.agentExtensions` in `Cargo.toml`                                |
| CocoaPods (Swift)             | `agent-extensions.json` at the pod root, retained with `preserve_paths`           |
| Composer (PHP)                | `extra.agentExtensions` in `composer.json`                                        |
| Conan (C++)                   | top-level `agentExtensions` in `conandata.yml`                                    |
| Conda                         | `share/agent-extensions/<package>/agent-extensions.json`                          |
| CPAN (Perl)                   | `x_agent_extensions` in `META.json`                                               |
| CRAN (R)                      | `Config/agentExtensions` in `DESCRIPTION`, as a single-line JSON array            |
| Docker / OCI                  | JSON array in the `org.agentextensions.recommendations` image label               |
| Go modules                    | `agent-extensions.json` at the module root                                        |
| Hackage (Haskell)             | JSON array in the `x-agent-extensions` `.cabal` custom field                      |
| Hex (Elixir)                  | `agent-extensions.json` at the package root                                       |
| Hugging Face                  | top-level `agentExtensions` in model-card YAML frontmatter                        |
| JSR (Deno / TypeScript)       | top-level `agentExtensions` in `deno.json`                                        |
| Julia (General)               | top-level `agentExtensions` in `Project.toml`                                     |
| LuaRocks (Lua)                | `agent-extensions.json` at the rock root, shipped with package data               |
| Maven (Java / Kotlin / Scala) | `agent-extensions.json` under `src/main/resources/META-INF/`                      |
| Mojo / Pixi                   | `agent-extensions.json` at the package root                                       |
| npm (JavaScript)              | top-level `agentExtensions` in `package.json`                                     |
| NuGet (.NET C# / F#)          | `agent-extensions.json` at the package root                                       |
| opam (OCaml)                  | JSON array in the `x-agent-extensions` custom field                               |
| Pub (Dart)                    | top-level `agentExtensions` in `pubspec.yaml`                                     |
| PyPI (Python)                 | `agent-extensions.json` package data named by the `[agentExtensions]` entry point |
| RubyGems (Ruby)               | JSON array string in `spec.metadata["agent_extensions"]`                          |
| SwiftPM (Swift)               | `agent-extensions.json` at the package root                                       |
| Zig                           | `agent-extensions.json` at the package root, listed in `.paths`                   |

For working library and consumer fixtures for every format, see [agentxm/polyglot-examples](https://github.com/agentxm/polyglot-examples).

## Where to go next

- `axm help agent-extensions-schema` — raw JSON Schema for the portable contract
- `axm help packs` — bundle several extensions behind one recommendation
- `axm help skills` — skill manifest details and external source fields
- `axm help subagents` — subagent manifest details
