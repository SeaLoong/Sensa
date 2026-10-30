const mode = process.argv[2];
if (mode === 'error') process.send({ type: 'sensa:error', error: 'private-pairing-key-must-not-be-shown' });
else if (mode !== 'timeout') process.send({ type: 'sensa:ready', url: 'http://127.0.0.1:43210/',
  port: 43210, configPath: '/isolated/config.json', reused: mode === 'reused' });
if (mode === 'reused') setTimeout(() => process.exit(0), 20);
else {
  const timer = setInterval(() => {}, 1000);
  process.on('message', message => {
    if (mode !== 'ignore-shutdown' && message?.type === 'sensa:shutdown') {
      clearInterval(timer); process.send({ type: 'sensa:stopped' }, () => process.exit(0));
    }
  });
}
