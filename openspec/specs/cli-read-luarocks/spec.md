## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed LuaRocks packages

The LuaRocks reader SHALL inspect `axm.json` sidecar files in the LuaRocks install tree. The location varies: `/usr/local/lib/luarocks/rocks-5.x/<pkg>/<version>/` for system installs or the user tree for local installs. Rockspec parsing requires Lua, so the reader SHALL use the sidecar file instead. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm.json sidecar

- **WHEN** `/usr/local/lib/luarocks/rocks-5.4/luasocket/3.1.0/axm.json` contains `{ "recommendedExtensions": ["@luarocks/skills/luasocket@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@luarocks/skills/luasocket@^1.0.0"]`

#### Scenario: Package without axm.json sidecar

- **WHEN** the LuaRocks install tree entry for the package does not contain an `axm.json` file
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: User tree location

- **WHEN** `axm.json` is present in the user tree at `~/.luarocks/lib/luarocks/rocks-5.4/<pkg>/<version>/axm.json`
- **THEN** the reader SHALL extract recommendations from the sidecar file

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` sidecar contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `axm.json` contains `{ "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing LuaRocks install tree handled gracefully

When the LuaRocks install tree does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without LuaRocks installed.

#### Scenario: LuaRocks install tree does not exist

- **WHEN** neither the system nor user LuaRocks install tree exists
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from install tree

- **WHEN** the LuaRocks install tree exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised
