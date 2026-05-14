const std = @import("std");

// Build script for agentxm-example-tinyflags. Exposes a library module so
// downstream consumers can `@import("tinyflags")`, plus a `test` step that
// runs the in-file `test "..." { ... }` blocks under `src/`.
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Public module — downstream packages reference this via
    // `b.dependency("agentxm_example_tinyflags", .{}).module("tinyflags")`.
    _ = b.addModule("tinyflags", .{
        .root_source_file = b.path("src/tinyflags.zig"),
        .target = target,
        .optimize = optimize,
    });

    // `zig build test` runs all in-file `test "..." { ... }` blocks under
    // `src/`. Each test imports its module directly so the root translation
    // unit (`src/tinyflags.zig`) does not need to re-export them.
    const tests = b.addTest(.{
        .root_source_file = b.path("src/tinyflags.zig"),
        .target = target,
        .optimize = optimize,
    });
    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);
}
