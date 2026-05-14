# Packages and extensions

AXM links extensions and packages in two directions. Extension authors declare **companion packages**; package authors declare **recommended extensions**; when both sides agree, the extension is **official** for that package.

## Companion packages

Any extension author may declare one or more `companionPackages` on an extension manifest (`skill.json`, `subagent.json`, `pack.json`, etc.) to signal that the extension is designed to work with those packages. Companion packages are identified by [Package URL](https://github.com/package-url/purl-spec).

**Always omit the version.** The declaration means "this extension targets this package," not "this extension is tied to a specific release":

```jsonc
{
  "companionPackages": ["pkg:npm/example-tinyflags"],
}
```

A versioned purl like `pkg:npm/example-tinyflags@0.1.0` is a strict claim about a single release, with real downsides:

- The declaration goes stale on every new package release.
- Users on any other version see no signal that the extension applies to them.
- The extension author must republish to track upstream package releases.

Version constraints belong on the package-metadata side via `recommendedExtensions` — the package author knows their own release and can express which extension version pairs with it, while the extension's companion declaration stays a stable identity edge. See [Recommended extensions](#recommended-extensions) below.

## Recommended extensions

Any package author may declare `recommendedExtensions` in their package's native metadata to signal that those extensions are recommended for working with the package. For npm, that field lives in `package.json`:

```jsonc
// package.json
{
  "axm": {
    "recommendedExtensions": ["@acme/packs/widget-kit@^1.0.0"],
  },
}
```

A recommendation can target any extension type — skill, subagent, command, MCP server, or pack. When recommending more than one extension, prefer a pack: one stable reference for the package author, with evolvable contents over time.

For the equivalent location in other package formats, see [Specifying recommended extensions in package metadata](#specifying-recommended-extensions-in-package-metadata) below.

## Official extensions

Both declarations are unilateral — any extension author may name any package as a companion, and any package author may recommend any extension. **Official** status is the only signal in this system that both sides agree, and it is derived: when an extension declares a package as a companion **and** that package recommends the same extension, the extension is official for that package.

## Specifying recommended extensions in package metadata

The location depends on the package format.

| Package format                | Metadata location                                                  |
| ----------------------------- | ------------------------------------------------------------------ |
| Cargo (Rust)                  | `[package.metadata.axm]` table in `Cargo.toml`                     |
| CocoaPods (Swift)             | `axm.json` sidecar at the pod root (retained via `preserve_paths`) |
| Composer (PHP)                | `axm` field in `composer.json`                                     |
| Conan (C++)                   | top-level `axm:` key in `conandata.yml`                            |
| CPAN (Perl)                   | `x_axm` field in `META.json`                                       |
| CRAN (R)                      | `Config/axm` field in `DESCRIPTION` (JSON-encoded, single line)    |
| Go modules                    | `axm.json` sidecar at the module root                              |
| Hackage (Haskell)             | `x-axm-<field>:` custom fields in the `.cabal` file                |
| Hex (Elixir)                  | `axm.json` sidecar at the package root                             |
| JSR (Deno / TypeScript)       | top-level `axm` field in `deno.json`                               |
| Julia (General)               | `[axm]` section in `Project.toml`                                  |
| LuaRocks (Lua)                | `axm.json` sidecar (shipped via `build.copy_directories`)          |
| Maven (Java / Kotlin / Scala) | `axm.json` under `src/main/resources/META-INF/`                    |
| npm (JavaScript)              | `axm` field in `package.json`                                      |
| NuGet (.NET C# / F#)          | `axm.json` sidecar at the package root                             |
| opam (OCaml)                  | `x-axm-<field>:` custom fields in the `.opam` file                 |
| Pub (Dart)                    | `axm` field in `pubspec.yaml`                                      |
| PyPI (Python)                 | `[tool.axm]` table in `pyproject.toml`                             |
| RubyGems (Ruby)               | stringified array in `spec.metadata["axm_recommended_extensions"]` |
| SwiftPM (Swift)               | `axm.json` sidecar at the package root                             |
| Zig                           | `axm.json` sidecar at the package root (listed in `.paths`)        |

For a complete, working example for every package format above — including paired library and consumer-app fixtures and the exact file shapes AXM reads — see [agentxm/polyglot-examples](https://github.com/agentxm/polyglot-examples).

## Where to go next

- `axm help packs` — bundling multiple extensions into a single recommendable pack
- `axm help skills` — skill manifest details
- `axm help subagents` — subagent manifest details
