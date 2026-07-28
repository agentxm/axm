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

Use `versionRange` only when the extension has a real compatibility constraint. The `versionRange` value is a VERS expression whose scheme matches the purl ecosystem:

```jsonc
{
  "packages": [
    {
      "purl": "pkg:npm/example-tinyflags",
      "versionRange": "vers:npm/>=1.0.0|<2.0.0",
    },
  ],
}
```

Do not put `@version` on the purl. A versioned purl like `pkg:npm/example-tinyflags@0.1.0` is an exact pin, with real downsides:

- The declaration goes stale on every new package release.
- Users on any other version see no signal that the extension applies to them.
- The extension author must republish to track upstream package releases.

When the package author recommends an extension from package metadata, they still use `extensions` to express which extension version pairs with their package release. `packages.versionRange` is for the extension author's side of the relationship: use it only when the extension itself depends on package APIs introduced or removed in a known range.

## Recommended extensions

Any package author may declare `extensions` in their package's native metadata to signal that those extensions are recommended for working with the package. Each entry is an object with an extension reference (`ref`) and an optional semver `versionRange`. For npm, that field lives in `package.json`:

```jsonc
// package.json
{
  "axm": {
    "extensions": [{ "ref": "@acme/packs/widget-kit" }],
  },
}
```

A recommendation can target any extension type — skill, subagent, command, MCP server, or pack. When recommending more than one extension, prefer a pack: one stable reference for the package author, with evolvable contents over time.

For the equivalent location in other package formats, see [Specifying recommended extensions in package metadata](#specifying-recommended-extensions-in-package-metadata) below.

Default to identity-only — omit `versionRange`. A recommendation is a discovery signal: AXM resolves it to the newest matching extension version and pins that exact version in `.axm/axm-lock.yaml`, so the range never controls what the user ends up installing. An identity-only recommendation never goes stale and always points at the current extension.

Add a semver `versionRange` only when your package genuinely pairs with a bounded major line of the extension — for example, when a later major release of the extension drops an API your package relies on:

```jsonc
{
  "axm": {
    "extensions": [{ "ref": "@acme/packs/widget-kit", "versionRange": "^1.0.0" }],
  },
}
```

A `^major` range still lets the extension author ship minor and patch releases without you republishing; it goes stale only on a major bump. Do not exact-pin (`"versionRange": "1.2.3"`): like a versioned companion-package purl, an exact pin goes stale on every extension release and forces you to republish to track it. Writing `"versionRange": "*"` is equivalent to omitting it — omit it. For pre-1.0 extensions, prefer identity-only: a caret range on a `0.x` version (`^0.1.0` resolves to `>=0.1.0 <0.2.0`) behaves almost like an exact pin and goes stale on every minor release.

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
| RubyGems (Ruby)               | stringified array in `spec.metadata["axm_extensions"]`             |
| SwiftPM (Swift)               | `axm.json` sidecar at the package root                             |
| Zig                           | `axm.json` sidecar at the package root (listed in `.paths`)        |

For a complete, working example for every package format above — including paired library and consumer-app fixtures and the exact file shapes AXM reads — see [agentxm/polyglot-examples](https://github.com/agentxm/polyglot-examples).

## Where to go next

- `axm help packs` — bundling multiple extensions into a single recommendable pack
- `axm help skills` — skill manifest details, plus how lockfile `integrity` and `sourceHash` work for installed extensions
- `axm help subagents` — subagent manifest details
