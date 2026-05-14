import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:agentxm_example_pawmatch/agentxm_example_pawmatch.dart';
import 'package:test/test.dart';

Future<({int exitCode, String stdout, String stderr})> _invoke(
  List<String> args,
) async {
  final stdoutBuffer = StringBuffer();
  final stderrBuffer = StringBuffer();
  final out = IOSink(_StringSinkConsumer(stdoutBuffer));
  final err = IOSink(_StringSinkConsumer(stderrBuffer));
  final runner = buildRunner(out: out, err: err);
  try {
    final result = await runner.run(args);
    await out.flush();
    await err.flush();
    return (
      exitCode: result ?? 0,
      stdout: stdoutBuffer.toString(),
      stderr: stderrBuffer.toString(),
    );
  } finally {
    await out.close();
    await err.close();
  }
}

void main() {
  test('fees exits zero and prints adoption fees', () async {
    final result = await _invoke(['fees']);
    expect(result.exitCode, 0);
    expect(result.stdout, contains('Adoption fees'));
  });

  test('browse lists known pets', () async {
    final result = await _invoke(['browse']);
    expect(result.exitCode, 0);
    expect(result.stdout, contains('Biscuit'));
  });

  test('show with unknown pet exits non-zero', () async {
    final result = await _invoke(['show', 'nonexistent']);
    expect(result.exitCode, 1);
    expect(result.stderr, contains('Unknown pet'));
  });
}

/// Minimal `StreamConsumer<List<int>>` that decodes to a `StringBuffer`,
/// so we can capture command output in tests without touching real IO.
class _StringSinkConsumer implements StreamConsumer<List<int>> {
  _StringSinkConsumer(this._buffer);

  final StringBuffer _buffer;

  @override
  Future addStream(Stream<List<int>> stream) async {
    await for (final chunk in stream) {
      _buffer.write(utf8.decode(chunk));
    }
  }

  @override
  Future close() async {}
}
