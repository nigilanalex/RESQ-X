const path = require('node:path');
const { createSecurity, ROLES } = require('../src/security');
const username = process.argv[2];
if (!username) { console.error('Usage: npm.cmd run init-admin -- <username>'); process.exit(1); }
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
    if (security.isConfigured()) throw new Error('An account already exists. Use the ADMIN user-management API to add users.');
    const password = await readSecret('Password (hidden, 12+ characters): ');
    security.createUser({ username, password, role: ROLES.ADMIN }); console.log('Initial ADMIN account created in backend/.data (git ignored).');
  } catch (error) { console.error(`Could not create admin: ${error.message}`); process.exitCode = 1; }
})();
