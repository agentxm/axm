// PawMatch CLI entry point. Built as a macOS command-line tool that links the
// AgentXMExampleTinyFlags pod via CocoaPods (see ../Podfile).

import AgentXMExampleTinyFlags
import Foundation

let stdout = FileHandleWriter(FileHandle.standardOutput)
let stderr = FileHandleWriter(FileHandle.standardError)

do {
    let flags = try PawMatchFlag.makeTinyFlags()
    let sessionId = ProcessInfo.processInfo.environment["USER"] ?? "anonymous"
    let cli = PawMatchCli(
        flags: flags,
        context: EvaluationContext.session(sessionId),
        stdout: stdout,
        stderr: stderr
    )
    let args = Array(CommandLine.arguments.dropFirst())
    exit(Int32(cli.run(args)))
} catch {
    stderr.writeLine("pawmatch: failed to initialize flags: \(error)")
    exit(2)
}
