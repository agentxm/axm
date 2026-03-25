## ADDED Requirements

### Requirement: table() renders typed tabular data

The `CliRenderer.table(items, columns, caption?)` method SHALL render a formatted table on stdout in interactive mode using `ColumnDef<T>` arrays. It SHALL be a no-op in machine mode.

#### Scenario: Table with multiple columns

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.table(skills, columns, "Skills")`
- **THEN** a formatted table SHALL appear on stdout with column headers and aligned data rows

#### Scenario: Table respects column alignment

- **WHEN** a `ColumnDef` has `align: "right"`
- **THEN** values in that column SHALL be right-aligned

#### Scenario: Table truncates long values with ellipsis

- **WHEN** a cell value exceeds the available column width
- **THEN** the value SHALL be truncated with an ellipsis to fit the terminal width

#### Scenario: Table adapts to terminal width

- **WHEN** the terminal width changes
- **THEN** `fill` width columns SHALL expand or contract to use available space
- **AND** `auto` width columns SHALL size to their content

#### Scenario: Table uses Clack visual language

- **WHEN** the `InteractiveRenderer` renders a table
- **THEN** the table SHALL use Clack-style guide lines and box-drawing characters

### Requirement: detail() renders single-item vertical key-value display

The `CliRenderer.detail(item, columns, title?)` method SHALL render a single item as a vertical key-value list on stdout in interactive mode, using the same `ColumnDef<T>` arrays as `table()`. It SHALL be a no-op in machine mode.

#### Scenario: Detail view with title

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.detail(skill, columns, "my-skill")`
- **THEN** a vertical key-value display SHALL appear with the title and each field as a labeled row

#### Scenario: Detail view formatting

- **WHEN** the `InteractiveRenderer` renders a detail view
- **THEN** labels SHALL be left-aligned
- **AND** values SHALL be right-aligned or space-separated from labels

#### Scenario: Priority filtering applies to detail views

- **WHEN** a `ColumnDef` has `priority: 1`
- **AND** the verbosity level is `"normal"`
- **THEN** that field SHALL NOT appear in the detail view

### Requirement: tree() renders structured non-tabular output

The `CliRenderer.tree(roots, def, title?)` method SHALL render a tree structure on stdout in interactive mode. It SHALL accept `ReadonlyArray<TreeNode<T>>` and a `TreeDef<T>` defining label, optional detail, and optional icon callbacks. It SHALL be a no-op in machine mode.

#### Scenario: Flat list (depth-1 tree)

- **WHEN** a handler passes nodes with no children
- **THEN** the tree SHALL render as a flat list with one line per item

#### Scenario: Nested tree with connectors

- **WHEN** a handler passes nodes with children
- **THEN** the tree SHALL render with indentation and box-drawing connectors

#### Scenario: Tree with icon callback

- **WHEN** the `TreeDef` includes an `icon` callback
- **THEN** each node SHALL be prefixed with the icon returned for its data

#### Scenario: Tree with detail callback

- **WHEN** the `TreeDef` includes a `detail` callback
- **AND** the callback returns a non-undefined string for a node
- **THEN** the detail SHALL be displayed right-aligned as a hint alongside the label

#### Scenario: Empty tree renders nothing

- **WHEN** `roots` is an empty array
- **THEN** no output SHALL be produced
- **AND** the title SHALL be suppressed

#### Scenario: Grouped tree with union type

- **WHEN** a handler passes `TreeNode<GroupNode | ItemNode>` with a discriminant
- **AND** the `TreeDef` label/icon callbacks use the discriminant to render differently
- **THEN** group nodes SHALL render as section headers
- **AND** item nodes SHALL render as indented children with appropriate icons

### Requirement: ColumnDef structure

`ColumnDef<T>` SHALL have fields: `key` (string), `header` (display label), `value` (accessor function `(item: T) => string`), `priority` (number, default 0), `align` (`"left" | "right"`), and `width` (`"auto" | "fill" | number`).

#### Scenario: Priority 0 fields always visible

- **WHEN** a `ColumnDef` has `priority: 0`
- **THEN** the column SHALL be visible at all verbosity levels

#### Scenario: Priority 1 fields visible at verbose

- **WHEN** a `ColumnDef` has `priority: 1`
- **AND** the verbosity level is `"verbose"` or higher
- **THEN** the column SHALL be visible

#### Scenario: Width fill expands to available space

- **WHEN** a `ColumnDef` has `width: "fill"`
- **THEN** the column SHALL expand to fill remaining terminal width after fixed and auto columns

### Requirement: TreeNode and TreeDef structure

`TreeNode<T>` SHALL have `data: T` and optional `children: ReadonlyArray<TreeNode<T>>`. `TreeDef<T>` SHALL have `label: (item: T) => string`, optional `detail: (item: T) => string | undefined`, and optional `icon: (item: T) => string | undefined`.

#### Scenario: TreeNode with children

- **WHEN** a `TreeNode` has a `children` array
- **THEN** those children SHALL be rendered indented below the parent

#### Scenario: TreeDef label is required

- **WHEN** a `TreeDef` is constructed
- **THEN** it SHALL have a `label` callback
- **AND** `detail` and `icon` SHALL be optional
