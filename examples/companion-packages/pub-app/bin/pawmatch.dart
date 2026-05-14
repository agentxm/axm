import 'dart:io';

import 'package:agentxm_example_pawmatch/agentxm_example_pawmatch.dart';

Future<void> main(List<String> args) async {
  final exitCode = await runCli(args);
  exit(exitCode);
}
