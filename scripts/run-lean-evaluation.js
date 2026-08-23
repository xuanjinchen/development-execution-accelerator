#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseCampaignArgs, runLeanCampaign } from '../src/lean-evaluation.js';

async function main(argv) {
  const config = parseCampaignArgs(argv);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const campaign = await runLeanCampaign({ repoRoot, ...config });
  process.stdout.write(`${JSON.stringify(campaign.result)}\n`);
  process.exitCode = campaign.result.valid ? 0 : 1;
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
