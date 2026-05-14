//! `pawmatch` is the example reference consumer of the
//! `agentxm_example_tinyflags` package. It is not publishable and exists
//! only to demonstrate consumption.

const std = @import("std");
const cli = @import("cli.zig");

pub fn main() !u8 {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const argv = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, argv);

    // argv[0] is the executable; drop it. argsAlloc returns null-terminated
    // slices; convert to plain `[]const u8` before handing them to the CLI.
    const rest_z = if (argv.len > 0) argv[1..] else argv;
    const rest = try allocator.alloc([]const u8, rest_z.len);
    defer allocator.free(rest);
    for (rest_z, 0..) |arg, i| rest[i] = arg;

    var stdout_file = std.io.getStdOut().writer();
    var stderr_file = std.io.getStdErr().writer();
    var out_buf = std.io.bufferedWriter(stdout_file);
    var err_buf = std.io.bufferedWriter(stderr_file);

    var c = cli.Cli.init(
        allocator,
        out_buf.writer().any(),
        err_buf.writer().any(),
        defaultSessionId(),
    ) catch |e| {
        std.debug.print("pawmatch: failed to initialize flags: {s}\n", .{@errorName(e)});
        return 1;
    };
    defer c.deinit();

    const code = c.run(rest);
    try out_buf.flush();
    try err_buf.flush();
    return code;
}

/// Derive a deterministic rollout context id from the environment. Falls
/// back to "anonymous" so unset shells still bucket consistently.
fn defaultSessionId() []const u8 {
    inline for (.{ "USER", "USERNAME", "LOGNAME" }) |name| {
        if (std.posix.getenv(name)) |value| {
            if (value.len > 0) return value;
        }
    }
    return "anonymous";
}
