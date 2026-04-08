## ADDED Requirements

### Requirement: Parse rockspec files for Lua dependencies

The LuaRocks detector SHALL parse `*.rockspec` files in the project directory and extract dependencies from the `dependencies` table using regex on common patterns. Each dependency SHALL be converted to a `pkg:luarocks` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from dependencies table

- **WHEN** a `.rockspec` file contains `dependencies = { "luasocket >= 3.0", "luafilesystem" }`
- **THEN** the detector SHALL produce purls for `luasocket` and `luafilesystem`

#### Scenario: Missing rockspec files

- **WHEN** the project directory does not contain any `.rockspec` files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed rockspec file

- **WHEN** a `.rockspec` file contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependencies table

- **WHEN** a `.rockspec` file exists but contains no `dependencies` table
- **THEN** the detector SHALL return an empty array

### Requirement: Skip Lua runtime dependency

The detector SHALL skip `lua` itself when it appears in the `dependencies` table, as it represents the Lua runtime and not a library dependency.

#### Scenario: Lua runtime excluded

- **WHEN** `dependencies` contains `"lua >= 5.1"` and `"luasocket >= 3.0"`
- **THEN** the detector SHALL produce a purl for `luasocket` only
- **AND** no purl SHALL be produced for `lua`

#### Scenario: Only Lua in dependencies

- **WHEN** `dependencies` contains only `"lua >= 5.1"`
- **THEN** the detector SHALL return an empty array

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version, the detector SHALL include the version in the purl. When a dependency specifies a range or no version, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `dependencies` contains `"luasocket == 3.1.0-1"`
- **THEN** the detector SHALL produce `pkg:luarocks/luasocket@3.1.0-1`

#### Scenario: Version range

- **WHEN** `dependencies` contains `"luasocket >= 3.0"`
- **THEN** the detector SHALL produce `pkg:luarocks/luasocket` (versionless)

#### Scenario: No version specified

- **WHEN** `dependencies` contains `"luafilesystem"`
- **THEN** the detector SHALL produce `pkg:luarocks/luafilesystem` (versionless)

### Requirement: Multiple rockspec files processed and deduplicated

When multiple `.rockspec` files exist in the project directory, the detector SHALL process all of them and deduplicate results by package name.

#### Scenario: Dependencies from multiple rockspec files

- **WHEN** `mylib-1.0-1.rockspec` contains `dependencies = { "luasocket" }` and `mylib-2.0-1.rockspec` contains `dependencies = { "luasocket", "cjson" }`
- **THEN** the detector SHALL produce purls for `luasocket` and `cjson` (deduplicated)

#### Scenario: Single rockspec file

- **WHEN** only `mylib-1.0-1.rockspec` exists with `dependencies = { "luasocket" }`
- **THEN** the detector SHALL produce a purl for `luasocket`
