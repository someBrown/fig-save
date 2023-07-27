import semver from 'semver';
import inquirer from 'inquirer';
import { readPackage } from 'read-pkg';
import { updatePackage } from 'write-pkg';
import { execa } from 'execa';

import path from 'path';

const { prompt } = inquirer;

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const CURRENT_ROOT = path.resolve(__dirname, '..');

const { version: currentVersion } = await readPackage({ cwd: CURRENT_ROOT });

const versionIncrements = ['patch', 'minor', 'major'];

const inc = (i) => semver.inc(currentVersion, i);
const run = (bin, args, opts = {}) =>
  execa(bin, args, { stdio: 'inherit', ...opts });

const gitPush = async (targetVersion) => {
  console.log('\nGit Push...');
  await run('git', ['tag', `v${targetVersion}`]);
  await run('git', ['push', 'origin', `refs/tags/v${targetVersion}`]);
  await run('git', ['push']);
};

const publishToNPM = async () => {
  console.log('\nPublishing packages...');
  await run('pnpm', ['publish'], {
    stdio: 'pipe',
  });
};

const gitCommit = async (targetVersion) => {
  const { stdout } = await run('git', ['diff'], { stdio: 'pipe' });
  if (stdout) {
    console.log('\nGit Commit...');
    await run('git', ['add', '-A']);
    await run('git', ['commit', '-m', `release: v${targetVersion}`]);
  }
};

const build = async () => {
  console.log('\nBuild...');
  await run('pnpm', ['run', 'build']);
};

const updateVersion = async (targetVersion) => {
  console.log('\nUpdate package.json...');
  await updatePackage(CURRENT_ROOT, {
    version: targetVersion,
  });
};

const genChangelog = async () => {
  console.log('\nGenerating changelog...');
  await run(`pnpm`, ['run', 'changelog']);
};

async function main() {
  const { release } = await prompt({
    name: 'release',
    message: 'Select release type',
    type: 'list',
    choices: versionIncrements.map((i) => `${i} (${inc(i)})`),
  });

  const targetVersion = release.match(/\((.*)\)/)[1];

  const { yes } = await prompt({
    type: 'confirm',
    name: 'yes',
    message: `Releasing v${targetVersion}. Confirm?`,
  });

  if (!yes) {
    return;
  }

  await updateVersion(targetVersion);

  await genChangelog();

  await build();

  await gitCommit(targetVersion);

  await publishToNPM();
  await gitPush(targetVersion);
}

main();
