#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDotEnv, rankKey, envForBot } from "./lib/env.mjs";
import { materializeRankConfig } from "./lib/katago.mjs";
import { loadSharedGreeting } from "./lib/ogs.mjs";
import { buildGtp2ogsConfig } from "./lib/gtp2ogs-config.mjs";
import { assertGtp2ogsInstalled, patchGtp2ogs } from "./lib/gtp2ogs-patch.mjs";
import { rankProfile, dailyOpponentStatePathFor, spawnBot } from "./lib/bots.mjs";

loadDotEnv();

process.on("uncaughtException", (error) => {
  console.error(error.message);
  process.exit(1);
});

assertGtp2ogsInstalled();

const defaultRanks = ["15k", "10k", "5k", "1d"];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kata-humanlike-ogs-"));

function usage() {
  return `Usage:
  npm start                  # run every configured bot with an OGS_API_KEY_<RANK>
  node scripts/start.mjs --dry-run`;
}

function parseOptions(argv) {
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return {
    dryRun,
  };
}

const options = parseOptions(process.argv.slice(2));
const bots = defaultRanks
  .map((rank) => {
    const key = rankKey(rank);
    const apiKey = envForBot("OGS_API_KEY", key);
    if (!apiKey) {
      return null;
    }

    return {
      rank: rank.toLowerCase(),
      key,
      profile: rankProfile(rank, key),
      apiKey,
    };
  })
  .filter(Boolean);

if (bots.length === 0) {
  const keys = defaultRanks.map((rank) => `OGS_API_KEY_${rankKey(rank)}`).join(", ");
  throw new Error(`No configured bots found. Set at least one of: ${keys}`);
}

const greeting = options.dryRun
  ? "Hello, I am a KataGo human-like bot. Good luck, have fun!"
  : await loadSharedGreeting();

for (const bot of bots) {
  const botTempDir = path.join(tempRoot, bot.rank);
  fs.mkdirSync(botTempDir, { recursive: true });
  bot.katagoConfigPath = materializeRankConfig(bot, tempRoot);
  bot.generatedGtp2ogsConfigPath = path.join(botTempDir, "gtp2ogs-live.json");
  bot.patchedGtp2ogsPath = path.join(botTempDir, "gtp2ogs-patched.js");
  const dailyOpponentStatePath = dailyOpponentStatePathFor(bot, bots.length);
  patchGtp2ogs(dailyOpponentStatePath, bot.patchedGtp2ogsPath);
  const gtp2ogsConfig = buildGtp2ogsConfig(bot, bot.katagoConfigPath, greeting);
  fs.writeFileSync(bot.generatedGtp2ogsConfigPath, `${JSON.stringify(gtp2ogsConfig, null, 2)}\n`);
}

if (options.dryRun) {
  for (const bot of bots) {
    console.log(
      `${bot.rank}: ${bot.profile}, config=${bot.katagoConfigPath}, gtp2ogs=${bot.generatedGtp2ogsConfigPath}`,
    );
  }
  process.exit(0);
}

const children = bots.map((bot) => spawnBot(bot, bots.length));
let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
  setTimeout(() => process.exit(exitCode), 2_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal, 0));
}

let remaining = children.length;
let exitCode = 0;
for (const child of children) {
  child.on("exit", (code, signal) => {
    if (signal && !shuttingDown) {
      shutdown(signal, 1);
      return;
    }
    if (code && code !== 0) {
      exitCode = code;
      shutdown("SIGTERM", code);
      return;
    }
    remaining -= 1;
    if (remaining === 0) {
      process.exit(exitCode);
    }
  });
}
