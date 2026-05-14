//! Tiny feature-flag library used by AXM companion package examples.
//!
//! Define flags with `Flag.boolean(...)` or `Flag.variant(...)` and evaluate
//! them with `Registry.enabled`, `Registry.variant`, or `Registry.evaluate`.
//! Rollout decisions are deterministic for a given (flag name, `Context`)
//! pair so the same caller always receives the same answer.
//!
//! Example:
//! ```
//! var registry = try Registry.init(allocator, &.{
//!     .{ .name = "checkout-redesign", .flag = Flag.booleanDefault(true) },
//! });
//! defer registry.deinit();
//! const ctx = Context.init("user-1");
//! const on = try registry.enabled("checkout-redesign", ctx); // true
//! ```

const std = @import("std");
const Allocator = std.mem.Allocator;
const ArrayList = std.ArrayList;

/// Caller identity used for deterministic rollout bucketing. An empty id maps
/// to a single shared "anonymous" bucket; supply a stable id for per-caller
/// bucketing.
pub const Context = struct {
    id: []const u8,

    pub fn init(id: []const u8) Context {
        return .{ .id = id };
    }

    pub fn anonymous() Context {
        return .{ .id = "" };
    }
};

/// Possible failures when defining or evaluating a flag. Mirrors the
/// other TinyFlags ports so behavior is consistent across ecosystems.
pub const FlagError = error{
    UnknownFlag,
    DuplicateFlag,
    EmptyFlagName,
    WrongKind,
    PercentageOutOfRange,
    EmptyVariantList,
    DuplicateVariant,
    EmptyVariantName,
    UnknownVariantDefault,
    UnknownVariantRollout,
    RolloutTotalExceeded,
    OutOfMemory,
};

/// Kind discriminator for a `Flag`.
pub const FlagKind = enum { boolean, variant };

/// Evaluated treatment of a flag. Exactly one of `.boolean` or `.variant` is
/// meaningful depending on the originating flag's `FlagKind`.
pub const Value = union(FlagKind) {
    boolean: bool,
    variant: []const u8,
};

/// Allocation in a variant rollout. Use `Flag.VariantAllocation` literals when
/// building variant flags.
pub const VariantAllocation = struct {
    name: []const u8,
    percentage: u8,
};

/// A flag definition. Construct via `Flag.boolean*` / `Flag.variant*`.
pub const Flag = union(FlagKind) {
    boolean: BooleanFlag,
    variant: VariantFlag,

    /// Boolean flag with a default and no rollout.
    pub fn booleanDefault(default: bool) Flag {
        return .{ .boolean = .{ .default = default, .rollout = null } };
    }

    /// Boolean flag with a default and percentage rollout (0..=100). Returns
    /// `error.PercentageOutOfRange` if `rollout` is outside the allowed range.
    pub fn booleanRollout(default: bool, rollout: u8) FlagError!Flag {
        if (rollout > 100) return error.PercentageOutOfRange;
        return .{ .boolean = .{ .default = default, .rollout = rollout } };
    }

    /// Variant flag with a list of allowed values and a default. The default
    /// must be one of the listed variants.
    pub fn variantDefault(
        allocator: Allocator,
        variants: []const []const u8,
        default: []const u8,
    ) FlagError!Flag {
        return buildVariant(allocator, variants, default, &.{});
    }

    /// Variant flag with a list of allowed values, a default, and per-variant
    /// percentage allocations. Allocations must reference declared variants
    /// and their sum must not exceed 100.
    pub fn variantWithRollout(
        allocator: Allocator,
        variants: []const []const u8,
        default: []const u8,
        rollout: []const VariantAllocation,
    ) FlagError!Flag {
        return buildVariant(allocator, variants, default, rollout);
    }

    /// Release any memory the flag definition owns (variant tables only).
    pub fn deinit(self: *Flag, allocator: Allocator) void {
        switch (self.*) {
            .boolean => {},
            .variant => |*v| v.deinit(allocator),
        }
    }
};

pub const BooleanFlag = struct {
    default: bool,
    rollout: ?u8,
};

pub const VariantFlag = struct {
    variants: [][]const u8,
    default: []const u8,
    rollout: []VariantAllocation,

    pub fn deinit(self: *VariantFlag, allocator: Allocator) void {
        allocator.free(self.variants);
        allocator.free(self.rollout);
    }
};

fn buildVariant(
    allocator: Allocator,
    variants: []const []const u8,
    default: []const u8,
    rollout: []const VariantAllocation,
) FlagError!Flag {
    if (variants.len == 0) return error.EmptyVariantList;

    var owned_variants = try allocator.alloc([]const u8, variants.len);
    errdefer allocator.free(owned_variants);
    for (variants, 0..) |v, i| {
        if (v.len == 0) return error.EmptyVariantName;
        for (variants[0..i]) |prior| {
            if (std.mem.eql(u8, prior, v)) return error.DuplicateVariant;
        }
        owned_variants[i] = v;
    }

    if (!containsName(variants, default)) return error.UnknownVariantDefault;

    var owned_rollout = try allocator.alloc(VariantAllocation, rollout.len);
    errdefer allocator.free(owned_rollout);

    var total: u32 = 0;
    for (rollout, 0..) |alloc, i| {
        if (alloc.percentage > 100) return error.PercentageOutOfRange;
        if (!containsName(variants, alloc.name)) return error.UnknownVariantRollout;
        total += alloc.percentage;
        if (total > 100) return error.RolloutTotalExceeded;
        owned_rollout[i] = alloc;
    }

    return .{ .variant = .{
        .variants = owned_variants,
        .default = default,
        .rollout = owned_rollout,
    } };
}

fn containsName(items: []const []const u8, target: []const u8) bool {
    for (items) |item| {
        if (std.mem.eql(u8, item, target)) return true;
    }
    return false;
}

/// Named entry passed to `Registry.init`.
pub const FlagEntry = struct {
    name: []const u8,
    flag: Flag,
};

/// A named set of flag definitions, owned by the registry until `deinit` is
/// called.
pub const Registry = struct {
    allocator: Allocator,
    entries: ArrayList(Entry),

    const Entry = struct {
        name: []const u8,
        flag: Flag,
    };

    /// Build a registry from an entry list. Each entry's `Flag` is moved into
    /// the registry; the caller must not `deinit` them separately.
    pub fn init(allocator: Allocator, entries: []const FlagEntry) FlagError!Registry {
        var list = ArrayList(Entry).initCapacity(allocator, entries.len) catch
            return error.OutOfMemory;
        errdefer {
            for (list.items) |*entry| entry.flag.deinit(allocator);
            list.deinit();
        }

        for (entries) |e| {
            if (e.name.len == 0) return error.EmptyFlagName;
            for (list.items) |prior| {
                if (std.mem.eql(u8, prior.name, e.name)) return error.DuplicateFlag;
            }
            list.appendAssumeCapacity(.{ .name = e.name, .flag = e.flag });
        }

        return .{ .allocator = allocator, .entries = list };
    }

    pub fn deinit(self: *Registry) void {
        for (self.entries.items) |*entry| entry.flag.deinit(self.allocator);
        self.entries.deinit();
    }

    pub fn definition(self: *const Registry, name: []const u8) ?*const Flag {
        for (self.entries.items) |*entry| {
            if (std.mem.eql(u8, entry.name, name)) return &entry.flag;
        }
        return null;
    }

    /// Boolean treatment for the named flag. Errors when the flag is unknown
    /// or is not a boolean flag.
    pub fn enabled(self: *const Registry, name: []const u8, ctx: Context) FlagError!bool {
        const flag = self.definition(name) orelse return error.UnknownFlag;
        return switch (flag.*) {
            .boolean => |b| evaluateBoolean(name, b, ctx),
            .variant => error.WrongKind,
        };
    }

    /// Variant treatment for the named flag. Errors when the flag is unknown
    /// or is not a variant flag.
    pub fn variant(self: *const Registry, name: []const u8, ctx: Context) FlagError![]const u8 {
        const flag = self.definition(name) orelse return error.UnknownFlag;
        return switch (flag.*) {
            .variant => |v| evaluateVariant(name, v, ctx),
            .boolean => error.WrongKind,
        };
    }

    /// Kind-dispatched evaluation returning a `Value`.
    pub fn evaluate(self: *const Registry, name: []const u8, ctx: Context) FlagError!Value {
        const flag = self.definition(name) orelse return error.UnknownFlag;
        return switch (flag.*) {
            .boolean => |b| .{ .boolean = evaluateBoolean(name, b, ctx) },
            .variant => |v| .{ .variant = evaluateVariant(name, v, ctx) },
        };
    }
};

fn evaluateBoolean(name: []const u8, flag: BooleanFlag, ctx: Context) bool {
    const rollout = flag.rollout orelse return flag.default;
    return bucketFor(name, ctx) < rollout;
}

fn evaluateVariant(name: []const u8, flag: VariantFlag, ctx: Context) []const u8 {
    if (flag.rollout.len == 0) return flag.default;
    const bucket = bucketFor(name, ctx);
    var upper: u32 = 0;
    for (flag.rollout) |alloc| {
        upper += alloc.percentage;
        if (bucket < upper) return alloc.name;
    }
    return flag.default;
}

/// Map (flag name, context id) to a stable bucket in `[0, 100)`. Uses
/// 32-bit FNV-1a — identical to the Rust port so example data stays
/// comparable across ecosystems.
fn bucketFor(name: []const u8, ctx: Context) u32 {
    const id: []const u8 = if (ctx.id.len == 0) "anonymous" else ctx.id;
    var hash: u32 = 2166136261;
    const prime: u32 = 16777619;
    for (name) |byte| {
        hash ^= byte;
        hash *%= prime;
    }
    hash ^= ':';
    hash *%= prime;
    for (id) |byte| {
        hash ^= byte;
        hash *%= prime;
    }
    return hash % 100;
}

// ── tests ───────────────────────────────────────────────────────────────────

const testing = std.testing;

test "boolean default is returned without rollout" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "checkout-redesign", .flag = Flag.booleanDefault(true) },
    });
    defer registry.deinit();
    try testing.expect(try registry.enabled("checkout-redesign", Context.init("user-1")));
}

test "boolean rollout 0 is always off" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "off", .flag = try Flag.booleanRollout(false, 0) },
    });
    defer registry.deinit();
    inline for (.{ "user-1", "user-2", "alice", "bob", "" }) |id| {
        try testing.expectEqual(false, try registry.enabled("off", Context.init(id)));
    }
}

test "boolean rollout 100 is always on" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "on", .flag = try Flag.booleanRollout(false, 100) },
    });
    defer registry.deinit();
    inline for (.{ "user-1", "user-2", "alice", "bob", "" }) |id| {
        try testing.expectEqual(true, try registry.enabled("on", Context.init(id)));
    }
}

test "boolean decision is stable for same context" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "experiment", .flag = try Flag.booleanRollout(false, 37) },
    });
    defer registry.deinit();
    const ctx = Context.init("user-42");
    const first = try registry.enabled("experiment", ctx);
    var i: usize = 0;
    while (i < 100) : (i += 1) {
        try testing.expectEqual(first, try registry.enabled("experiment", ctx));
    }
}

test "boolean rollout 50 splits roughly evenly" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "half", .flag = try Flag.booleanRollout(false, 50) },
    });
    defer registry.deinit();
    var enabled_count: u32 = 0;
    var buf: [32]u8 = undefined;
    var i: u32 = 0;
    while (i < 1000) : (i += 1) {
        const id = try std.fmt.bufPrint(&buf, "user-{d}", .{i});
        if (try registry.enabled("half", Context.init(id))) enabled_count += 1;
    }
    try testing.expect(enabled_count > 250 and enabled_count < 750);
}

test "variant default returned without rollout" {
    var registry = try Registry.init(testing.allocator, &.{
        .{
            .name = "search-ranking",
            .flag = try Flag.variantDefault(
                testing.allocator,
                &.{ "classic", "semantic" },
                "classic",
            ),
        },
    });
    defer registry.deinit();
    const got = try registry.variant("search-ranking", Context.init("user-1"));
    try testing.expectEqualStrings("classic", got);
}

test "variant rollout 100 replaces default" {
    var registry = try Registry.init(testing.allocator, &.{
        .{
            .name = "search-ranking",
            .flag = try Flag.variantWithRollout(
                testing.allocator,
                &.{ "classic", "semantic" },
                "classic",
                &.{.{ .name = "semantic", .percentage = 100 }},
            ),
        },
    });
    defer registry.deinit();
    inline for (.{ "alice", "bob", "carol" }) |id| {
        const got = try registry.variant("search-ranking", Context.init(id));
        try testing.expectEqualStrings("semantic", got);
    }
}

test "variant decision is stable for same context" {
    var registry = try Registry.init(testing.allocator, &.{
        .{
            .name = "strategy",
            .flag = try Flag.variantWithRollout(
                testing.allocator,
                &.{ "a", "b", "c" },
                "a",
                &.{
                    .{ .name = "b", .percentage = 25 },
                    .{ .name = "c", .percentage = 25 },
                },
            ),
        },
    });
    defer registry.deinit();
    const ctx = Context.init("user-7");
    const first = try registry.variant("strategy", ctx);
    var i: usize = 0;
    while (i < 100) : (i += 1) {
        try testing.expectEqualStrings(first, try registry.variant("strategy", ctx));
    }
}

test "variant rejects unknown default" {
    try testing.expectError(
        error.UnknownVariantDefault,
        Flag.variantDefault(testing.allocator, &.{ "classic", "semantic" }, "personalized"),
    );
}

test "variant rejects unknown rollout entry" {
    try testing.expectError(
        error.UnknownVariantRollout,
        Flag.variantWithRollout(
            testing.allocator,
            &.{ "classic", "semantic" },
            "classic",
            &.{.{ .name = "personalized", .percentage = 50 }},
        ),
    );
}

test "variant rejects rollout total over 100" {
    try testing.expectError(
        error.RolloutTotalExceeded,
        Flag.variantWithRollout(
            testing.allocator,
            &.{ "classic", "semantic" },
            "classic",
            &.{
                .{ .name = "classic", .percentage = 80 },
                .{ .name = "semantic", .percentage = 30 },
            },
        ),
    );
}

test "variant rejects duplicate names" {
    try testing.expectError(
        error.DuplicateVariant,
        Flag.variantDefault(testing.allocator, &.{ "a", "a" }, "a"),
    );
}

test "variant rejects empty list" {
    try testing.expectError(
        error.EmptyVariantList,
        Flag.variantDefault(testing.allocator, &.{}, "a"),
    );
}

test "boolean rejects rollout above 100" {
    try testing.expectError(
        error.PercentageOutOfRange,
        Flag.booleanRollout(false, 101),
    );
}

test "enabled on variant flag errors" {
    var registry = try Registry.init(testing.allocator, &.{
        .{
            .name = "strategy",
            .flag = try Flag.variantDefault(testing.allocator, &.{ "a", "b" }, "a"),
        },
    });
    defer registry.deinit();
    try testing.expectError(error.WrongKind, registry.enabled("strategy", Context.anonymous()));
}

test "variant on boolean flag errors" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "toggle", .flag = Flag.booleanDefault(true) },
    });
    defer registry.deinit();
    try testing.expectError(error.WrongKind, registry.variant("toggle", Context.anonymous()));
}

test "evaluate dispatches by kind" {
    var registry = try Registry.init(testing.allocator, &.{
        .{ .name = "toggle", .flag = Flag.booleanDefault(true) },
        .{
            .name = "strategy",
            .flag = try Flag.variantDefault(testing.allocator, &.{ "a", "b" }, "b"),
        },
    });
    defer registry.deinit();
    const ctx = Context.anonymous();
    switch (try registry.evaluate("toggle", ctx)) {
        .boolean => |v| try testing.expectEqual(true, v),
        .variant => try testing.expect(false),
    }
    switch (try registry.evaluate("strategy", ctx)) {
        .variant => |v| try testing.expectEqualStrings("b", v),
        .boolean => try testing.expect(false),
    }
}

test "unknown flag errors" {
    var registry = try Registry.init(testing.allocator, &.{});
    defer registry.deinit();
    try testing.expectError(error.UnknownFlag, registry.enabled("missing", Context.anonymous()));
    try testing.expectError(error.UnknownFlag, registry.variant("missing", Context.anonymous()));
    try testing.expectError(error.UnknownFlag, registry.evaluate("missing", Context.anonymous()));
}

test "duplicate flag name errors" {
    try testing.expectError(error.DuplicateFlag, Registry.init(testing.allocator, &.{
        .{ .name = "dup", .flag = Flag.booleanDefault(false) },
        .{ .name = "dup", .flag = Flag.booleanDefault(true) },
    }));
}

test "empty flag name errors" {
    try testing.expectError(error.EmptyFlagName, Registry.init(testing.allocator, &.{
        .{ .name = "", .flag = Flag.booleanDefault(false) },
    }));
}
