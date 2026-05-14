//! Root test entrypoint. `zig build test` compiles this file with all
//! referenced modules and runs every `test "..."` block it can reach.

const std = @import("std");

pub const cli = @import("cli.zig");
pub const charities = @import("charities.zig");
pub const flags = @import("flags.zig");
pub const match_engine = @import("match_engine.zig");
pub const pets = @import("pets.zig");
pub const variants = @import("variants.zig");

const tf = @import("tinyflags");

const testing = std.testing;

const TestBuf = std.ArrayList(u8);

fn runCli(args: []const []const u8, out_buf: *TestBuf, err_buf: *TestBuf) !u8 {
    var c = try cli.Cli.init(
        testing.allocator,
        out_buf.writer().any(),
        err_buf.writer().any(),
        "test-session",
    );
    defer c.deinit();
    return c.run(args);
}

test "fees exits zero" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"fees"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Adoption fees") != null);
}

test "return-support exits zero" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"return-support"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Return support") != null);
}

test "browse lists pets" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"browse"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Biscuit") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, "Pepper") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, "Marigold") != null);
}

test "browse filters by species" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "browse", "--species", "cat" }, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Pepper") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, "Biscuit") == null);
}

test "show known pet" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "show", "biscuit" }, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Biscuit") != null);
}

test "show unknown pet exits one" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "show", "no-such-pet" }, &out, &err);
    try testing.expectEqual(@as(u8, 1), code);
    try testing.expect(std.mem.indexOf(u8, err.items, "Unknown pet") != null);
}

test "match with no prefs hints at flags" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"match"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Strategy:") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, "(no preference flags provided") != null);
}

test "match with prefs does not hint" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "match", "--has-kids", "--quiet-home" }, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "(no preference flags provided") == null);
}

test "apply known pet" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "apply", "biscuit" }, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Adoption application for Biscuit") != null);
}

test "donate lists charities and disclaimer" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"donate"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Animal-welfare charities") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, charities.charities_disclaimer) != null);
}

test "donate filters by focus" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "donate", "--focus", "rescue" }, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "Brother Wolf") != null);
    try testing.expect(std.mem.indexOf(u8, out.items, "ASPCA") == null);
}

test "donate unknown charity exits one" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{ "donate", "no-such-charity" }, &out, &err);
    try testing.expectEqual(@as(u8, 1), code);
    try testing.expect(std.mem.indexOf(u8, err.items, "Unknown charity") != null);
}

test "unknown command exits two" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"nonsense"}, &out, &err);
    try testing.expectEqual(@as(u8, 2), code);
    try testing.expect(std.mem.indexOf(u8, err.items, "unknown command") != null);
}

test "no args exits one" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{}, &out, &err);
    try testing.expectEqual(@as(u8, 1), code);
}

test "help exits zero" {
    var out = TestBuf.init(testing.allocator);
    defer out.deinit();
    var err = TestBuf.init(testing.allocator);
    defer err.deinit();

    const code = try runCli(&.{"--help"}, &out, &err);
    try testing.expectEqual(@as(u8, 0), code);
    try testing.expect(std.mem.indexOf(u8, out.items, "pawmatch — community pet adoption CLI.") != null);
}

test "flag registry builds without errors" {
    var registry = try flags.buildRegistry(testing.allocator);
    defer registry.deinit();
    // Every advertised flag is registered.
    try testing.expect(registry.definition(flags.FLAG_HOME_CHECK_FOLLOWUP) != null);
    try testing.expect(registry.definition(flags.FLAG_FEE_BREAKDOWN_DETAILED) != null);
    try testing.expect(registry.definition(flags.FLAG_LONG_STAY_HIGHLIGHT) != null);
    try testing.expect(registry.definition(flags.FLAG_SUGGEST_DONATE_AFTER_ADOPT) != null);
    try testing.expect(registry.definition(flags.FLAG_SHOW_CHARITY_RATINGS) != null);
    try testing.expect(registry.definition(flags.FLAG_RECOMMENDATION_STRATEGY) != null);
    try testing.expect(registry.definition(flags.FLAG_MATCH_QUIZ_DEPTH) != null);
    try testing.expect(registry.definition(flags.FLAG_PET_CARD_STYLE) != null);
    try testing.expect(registry.definition(flags.FLAG_DONATE_FOCUS_DEFAULT) != null);
}

test "variant enums parse known values" {
    try testing.expect(variants.PetCardStyle.parse("detailed") == .detailed);
    try testing.expect(variants.MatchStrategy.parse("match-quiz") == .match_quiz);
    try testing.expect(variants.MatchDepth.parse("standard") == .standard);
    try testing.expect(variants.DonateFocus.parse("all") == .all);
    try testing.expect(variants.PetCardStyle.parse("nope") == null);
}

test "tinyflags ctx is deterministic" {
    const a = tf.Context.init("user-1");
    var registry = try tf.Registry.init(testing.allocator, &.{
        .{ .name = "experiment", .flag = try tf.Flag.booleanRollout(false, 50) },
    });
    defer registry.deinit();
    const first = try registry.enabled("experiment", a);
    var i: usize = 0;
    while (i < 50) : (i += 1) {
        try testing.expectEqual(first, try registry.enabled("experiment", a));
    }
}
