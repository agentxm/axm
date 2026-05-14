// Output sink for the PawMatch runner. Production uses `FileHandle`-backed
// stdout/stderr; tests inject a `BufferOutput` so they can assert on the
// rendered text.

import Foundation

public protocol PawMatchOutput {
    func writeLine(_ line: String)
    func writeError(_ line: String)
}

public final class StandardOutput: PawMatchOutput {
    public init() {}

    public func writeLine(_ line: String) {
        print(line)
    }

    public func writeError(_ line: String) {
        FileHandle.standardError.write(Data((line + "\n").utf8))
    }
}

/// Test-only output that buffers writes so assertions can inspect them.
public final class BufferOutput: PawMatchOutput {
    public private(set) var stdout: String = ""
    public private(set) var stderr: String = ""

    public init() {}

    public func writeLine(_ line: String) {
        stdout += line
        stdout += "\n"
    }

    public func writeError(_ line: String) {
        stderr += line
        stderr += "\n"
    }
}
