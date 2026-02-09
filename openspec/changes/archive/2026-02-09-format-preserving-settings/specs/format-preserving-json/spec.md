## ADDED Requirements

### Requirement: Modify JSON file preserves existing formatting

The system SHALL provide a `modifyJsonFile` operation that applies targeted edits to a JSON file on disk without reformatting unchanged content.

#### Scenario: Edit a property in a tab-indented file

- **WHEN** a JSON file uses tab indentation and `modifyJsonFile` sets `["skills", "lint"]` to `"@community/lint@^1.0.0"`
- **THEN** the written file contains the updated value at `skills.lint`
- **AND** all content outside the edit region is byte-for-byte identical to the original file

#### Scenario: Edit a property in a 4-space-indented file

- **WHEN** a JSON file uses 4-space indentation and `modifyJsonFile` sets `["agents"]` to `["claude-code", "cursor"]`
- **THEN** the written file contains the updated agents array
- **AND** all content outside the edit region is byte-for-byte identical to the original file

#### Scenario: Trailing newline preserved

- **WHEN** a JSON file ends with a trailing newline and `modifyJsonFile` modifies a property
- **THEN** the written file still ends with a trailing newline

#### Scenario: No trailing newline preserved

- **WHEN** a JSON file does not end with a trailing newline and `modifyJsonFile` modifies a property
- **THEN** the written file still does not end with a trailing newline

### Requirement: Newly inserted content matches file's existing style

The system SHALL detect the indentation style and line endings of the existing file and use them when formatting newly inserted JSON content.

#### Scenario: Insert into tab-indented file

- **WHEN** a JSON file uses tab indentation and `modifyJsonFile` inserts a new property
- **THEN** the newly inserted content uses tab indentation

#### Scenario: Insert into 4-space-indented file

- **WHEN** a JSON file uses 4-space indentation and `modifyJsonFile` inserts a new property
- **THEN** the newly inserted content uses 4-space indentation

#### Scenario: Insert into file with CRLF line endings

- **WHEN** a JSON file uses CRLF (`\r\n`) line endings and `modifyJsonFile` inserts a new property
- **THEN** the newly inserted content uses CRLF line endings

### Requirement: New file uses sensible defaults

The system SHALL use 2-space indentation, LF line endings, and a trailing newline when creating a new JSON file from scratch (no existing content to detect from).

#### Scenario: Write new settings file

- **WHEN** `writeSettings` creates a new `settings.json` that did not previously exist
- **THEN** the file uses 2-space indentation, LF line endings, and ends with a trailing newline

### Requirement: Multiple edits in a single operation

The system SHALL accept multiple modifications in a single `modifyJsonFile` call, applying all edits in one read-write cycle.

#### Scenario: Set two properties at once

- **WHEN** `modifyJsonFile` is called with modifications for `["skills", "lint"]` and `["skills", "format"]`
- **THEN** both properties are updated in the written file
- **AND** only one read and one write to disk occurs

### Requirement: Remove property via undefined value

The system SHALL remove a JSON property when the modification value is `undefined`.

#### Scenario: Remove a skill entry

- **WHEN** `modifyJsonFile` is called with path `["skills", "lint"]` and value `undefined`
- **THEN** the `lint` key is removed from the `skills` object in the written file

#### Scenario: Remove last property from parent object

- **WHEN** `modifyJsonFile` removes the only remaining key in the `skills` object
- **THEN** the `skills` object becomes empty (`{}`) or is removed, depending on the caller's intent
