import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const unsigned = process.argv.includes('--unsigned');
if (process.platform !== 'darwin') throw new Error('Maak de macOS-distributie op een Mac.');
if (!unsigned) {
  const hasNotaryCredentials = Boolean(process.env.APPLE_KEYCHAIN_PROFILE || (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) || (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER));
  if (!hasNotaryCredentials) throw new Error('Productiedistributie vereist notarization-gegevens. Configureer Apple-gegevens of gebruik desktop:package:unsigned voor een duidelijk gemarkeerde ontwikkelversie.');
  if (!process.env.CSC_LINK) {
    const {stdout} = await promisify(execFile)('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
    if (!stdout.includes('Developer ID Application:')) throw new Error('Geen Developer ID Application-certificaat beschikbaar. Een Apple Development-certificaat is onvoldoende voor distributie.');
  }
}
const run = (file, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(file, args, {cwd: root, env, stdio: 'inherit'});
  child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} eindigde met status ${code}`)));
});
await run(process.execPath, ['desktop/scripts/collect-licenses.mjs']);
await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'desktop/vite.config.mjs']);
// macOS disk-image creation can contend for hdiutil resources across architectures.
for (const architecture of ['--arm64', '--x64']) {
  await run(process.execPath, ['node_modules/electron-builder/cli.js', '--config', unsigned ? 'desktop/electron-builder.unsigned.yml' : 'desktop/electron-builder.yml', '--mac', 'dmg', 'zip', architecture, '--publish', 'never'], unsigned ? {...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false'} : process.env);
}
await run(process.execPath, ['desktop/scripts/checksum-artifacts.mjs', ...(unsigned ? ['--unsigned'] : [])]);
