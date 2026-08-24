#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  isCertifiedResult,
  parseCampaignArgs,
  resolveCodexLaunch,
  runLeanCampaign,
} from '../src/lean-evaluation.js';

export async function main(argv, {
  parseArgs = parseCampaignArgs,
  resolveLaunch = resolveCodexLaunch,
  runCampaign = runLeanCampaign,
  stdout = process.stdout,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const config = parseArgs(argv);
  const launcher = await resolveLaunch({
    entryPath: config.codexEntry,
    expectedVersion: config.codexVersion,
  });
  const campaign = await runCampaign({ repoRoot, ...config, launcher });
  stdout.write(`${JSON.stringify(campaign.result)}\n`);
  return campaign.result.certified === true && isCertifiedResult(campaign.result) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
