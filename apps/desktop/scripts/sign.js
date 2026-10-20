// electron-builder `win.sign` hook (custom signer).
//
// STUB: does nothing unless code-signing credentials are present, so unsigned
// developer builds keep working. For release builds set, on the Windows build
// machine, either
//   CSC_LINK + CSC_KEY_PASSWORD   (a .pfx certificate), or
//   CSC_LINK=<path to cert> with a hardware token / cloud HSM (then replace the
//   body below with your signtool / AzureSignTool / SSL.com eSigner command).
// Never commit certificates or passwords.
'use strict';

const { spawnSync } = require('node:child_process');

exports.default = async function sign(configuration) {
  if (!process.env.CSC_LINK) {
    console.log(`[sign] CSC_LINK not set, leaving ${configuration.path} unsigned`);
    return;
  }
  const args = [
    'sign', '/fd', configuration.hash || 'sha256',
    '/f', process.env.CSC_LINK,
    '/p', process.env.CSC_KEY_PASSWORD || '',
    '/tr', process.env.CSC_TIMESTAMP_URL || 'http://timestamp.digicert.com', '/td', 'sha256',
    configuration.path,
  ];
  const res = spawnSync('signtool', args, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`signtool failed with exit code ${res.status}`);
};
