/** Capture real CLI bytes without changing their ordering or adding output. */
export const agentEvaluationCliWrapper = `#!/usr/bin/python3
import json, os, pathlib, signal, subprocess, sys, threading, time, uuid
root = pathlib.Path('/tmp/cli-captures') / str(uuid.uuid4())
root.mkdir(parents=True)
started = time.monotonic()
with (root/'stdout').open('wb') as out, (root/'stderr').open('wb') as err:
    child = subprocess.Popen(['/tmp/axm-binary', *sys.argv[1:]], stdin=sys.stdin.buffer, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def record_json(name, value):
        temporary = root/(name+'.tmp')
        temporary.write_text(json.dumps(value)+'\\n')
        temporary.replace(root/name)
    record_json('started.json', {'pid':child.pid, 'args':sys.argv[1:], 'cwd':os.getcwd(), 'startedAt':time.time()})
    stopped = threading.Event()
    def control():
        while not stopped.wait(0.02):
            request = root/'signal-request.json'
            if not request.exists(): continue
            value = json.loads(request.read_text())
            if value.get('signal') != 'SIGINT':
                record_json('signal-delivery.json', {'pid':child.pid, 'status':'rejected'})
            elif child.poll() is None:
                try:
                    child.send_signal(signal.SIGINT)
                    record_json('signal-delivery.json', {'pid':child.pid, 'signal':'SIGINT', 'status':'delivered', 'deliveredAt':time.time()})
                except ProcessLookupError:
                    record_json('signal-delivery.json', {'pid':child.pid, 'status':'already-exited'})
            else:
                record_json('signal-delivery.json', {'pid':child.pid, 'status':'already-exited'})
            return
    controller = threading.Thread(target=control)
    controller.start()
    def forward(source, target, record):
        while True:
            chunk = source.read1(65536)
            if not chunk: break
            record.write(chunk); record.flush()
            try: target.write(chunk); target.flush()
            except BrokenPipeError:
                source.close()
                break
    threads = [threading.Thread(target=forward, args=(child.stdout, sys.stdout.buffer, out)), threading.Thread(target=forward, args=(child.stderr, sys.stderr.buffer, err))]
    for thread in threads: thread.start()
    code = child.wait()
    stopped.set(); controller.join()
    for thread in threads: thread.join()
(root/'receipt.json').write_text(json.dumps({'args':sys.argv[1:], 'cwd':os.getcwd(), 'exitCode':code, 'elapsedMs':(time.monotonic()-started)*1000})+'\\n')
sys.exit(code if code >= 0 else 128-code)
`;
