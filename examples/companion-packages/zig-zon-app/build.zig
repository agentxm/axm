const std = @import("std");

// Build script for the PawMatch CLI. Produces an executable named
// `agentxm-example-pawmatch` plus a `test` step that runs in-file
// `test "..." { ... }` blocks under `src/`.
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const tinyflags_dep = b.dependency("agentxm_example_tinyflags", .{
        .target = target,
        .optimize = optimize,
    });
    const tinyflags_mod = tinyflags_dep.module("tinyflags");

    const exe = b.addExecutable(.{
        .name = "agentxm-example-pawmatch",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe.root_module.addImport("tinyflags", tinyflags_mod);
    b.installArtifact(exe);

    const run_exe = b.addRunArtifact(exe);
    if (b.args) |args| run_exe.addArgs(args);
    const run_step = b.step("run", "Run the PawMatch CLI");
    run_step.dependOn(&run_exe.step);

    const tests = b.addTest(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    tests.root_module.addImport("tinyflags", tinyflags_mod);
    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);
}
