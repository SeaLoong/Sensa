"""Linux-only PTY device inside the CI container; no real serial ports are opened."""
import json
import os
import pty
import tty

master, slave = pty.openpty()
tty.setraw(slave)
print(json.dumps({'port': os.ttyname(slave)}), flush=True)
pending = b''
while True:
    pending += os.read(master, 4096)
    while b'\n' in pending:
        line, pending = pending.split(b'\n', 1)
        command = line.decode('ascii', errors='replace').strip()
        print(json.dumps({'line': command}), flush=True)
        answer = {'D0': 'Sensa CI mock firmware', 'D1': 'TCode v0.3', 'D2': 'L0 Linear\nV0 Vibrate'}.get(command)
        if answer:
            os.write(master, (answer + '\n').encode())
