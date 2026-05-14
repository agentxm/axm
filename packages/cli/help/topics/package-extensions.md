# Package Extensions

AXM links extensions and packages in two directions: extension authors declare the packages an extension is designed for, and package authors declare the extensions they recommend. When both sides agree, the extension is considered official for that package.

## Companion packages

Any extension author may declare one or more `companionPackages` on an extension manifest (`skill.json`, `subagent.json`, `pack.json`, etc.) to signal that the extension is designed to work with those packages. Companion packages are identified by [Package URL](https://github.com/package-url/purl-spec).

```
{
  "companionPackages": [
    "pkg:npm/%40agentxm/example-tinyflags@0.1.0"
  ]
}
```

There is no gatekeeping — any extension author may name any package as a companion. The declaration is a unilateral claim from the extension side.

## Recommended extensions

Any package author may declare `recommendedExtensions` in their package's native metadata to signal that those extensions are recommended for working with the package. Each ecosystem has its own slot — pick the location that is idiomatic for the registry's tooling and survives publish:

| Ecosystem                     | Where to define AXM metadata                                       |
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

For a complete, working example in every ecosystem above — including paired library and consumer-app fixtures and the exact file shapes AXM reads — see [agentxm/polyglot-examples](https://github.com/agentxm/polyglot-examples).

Any extension type is acceptable. When a package author wants to recommend more than one extension, **prefer recommending a pack** — it gives the package author one stable reference and lets the pack evolve its contents over time. A common good practice is to publish a companion extension pack alongside the package and recommend that single pack.

```jsonc
// package.json
{
  "axm": {
    "recommendedExtensions": ["@acme/packs/widget-kit@^1.0.0"],
  },
}
```

As with companion packages, the declaration is unilateral — any package author may recommend any extension.

## Official extensions

When an extension declares a package as a companion **and** that package recommends the same extension, the extension is considered an **official** extension for that package. Official status is the only signal in this system that both sides agree, and it is derived — not separately declared.

## Where to go next

- `axm help packs` — bundling multiple extensions into a single recommendable pack
- `axm help skills` · `axm help subagents` — per-type manifest details
