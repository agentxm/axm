## ADDED Requirements

### Requirement: Pack compatibility derived from constituent extensions

Extension packs SHALL NOT declare `compatiblePackages` on their own manifest. Package compatibility for a pack SHALL be derived from the `compatiblePackages` declarations of its constituent extensions at query time.

#### Scenario: Pack preview shows per-extension compatibility

- **WHEN** user runs `axm packs install --preview` for a pack containing `@acme/skills/react-testing` with `compatiblePackages: ["pkg:npm/react"]`
- **THEN** the preview output SHALL show `pkg:npm/react` alongside `@acme/skills/react-testing`

#### Scenario: Pack with no compatible extensions

- **WHEN** a pack's constituent extensions have no `compatiblePackages` declarations
- **THEN** the preview output SHALL show no compatibility information for those extensions

### Requirement: Discover returns individual extensions not packs

The registry discover endpoint SHALL return individual extensions that match detected packages, not packs. If a matched extension belongs to a pack, only the individual extension appears in discover results. Surfacing pack membership in discover output is deferred.

#### Scenario: Extension in a pack matches via discover

- **WHEN** `@acme/skills/react-testing` declares `compatiblePackages: ["pkg:npm/react"]`
- **AND** `@acme/skills/react-testing` is included in `@acme/packs/frontend`
- **AND** user runs `axm discover` with `pkg:npm/react` detected
- **THEN** `@acme/skills/react-testing` SHALL appear in discover results as an individual extension
- **AND** no pack reference SHALL appear in the discover output
