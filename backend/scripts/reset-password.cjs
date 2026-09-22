const path = require('node:path');
const { createSecurity } = require('../src/security');
const username = process.argv[2];
if (!username) { console.error('Usage: npm.cmd run reset-password -- <username>'); process.exit(1); }
function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return Promise.reject(new Error('A private interactive terminal is required'));
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData); process.stdout.write('\n'); error ? reject(error) : resolve(value); };
    const onData = data => { for (const character of data) { if (character === '\u0003') return finish(new Error('Cancelled')); if (character === '\r' || character === '\n') return finish(); if (character === '\u007f' || character === '\b') value = value.slice(0, -1); else if (character >= ' ') value += character; } };
    process.stdin.on('data', onData);
  });
}
(async () => {
  try {
    const security = createSecurity({ dataDir: path.join(__dirname, '..', '.data') });
    const user = security.userByUsername(username); if (!user) throw new Error('Unknown user');
    const password = await readSecret('New password (hidden, 12+ characters): ');
    security.changePassword(user.id, password); console.log(`Password rotated for ${user.username}. Existing sessions were invalidated.`);
  } catch (error) { console.error(`Could not reset password: ${error.message}`); process.exitCode = 1; }
})();
