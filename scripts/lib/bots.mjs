import path from "node:path";
import { spawn } from "node:child_process";
import { repoRoot, splitArgs, envForBot } from "./env.mjs";
import { katagoBin, katagoArgsFor } from "./katago.mjs";

export function rankProfile(rank, key) {
  return process.env[`KATAGO_HUMAN_PROFILE_${key}`] || `rank_${rank.toLowerCase()}`;
}

export function dailyOpponentStatePathFor(bot, botCount) {
  const configured = envForBot("OGS_DAILY_OPPONENT_STATE", bot.key);
  if (configured) {
    return path.resolve(repoRoot, configured);
  }
  if (botCount === 1 && process.env.OGS_DAILY_OPPONENT_STATE) {
    return path.resolve(repoRoot, process.env.OGS_DAILY_OPPONENT_STATE);
  }
  if (botCount === 1) {
    return path.resolve(repoRoot, "data/opponents-utc-day.json");
  }
  return path.resolve(repoRoot, `data/opponents-${bot.rank}-utc-day.json`);
}

function prefixStream(stream, destination, prefix) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      destination.write(`${prefix}${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffered) {
      destination.write(`${prefix}${buffered}\n`);
    }
  });
}

export function spawnBot(bot, botCount) {
  const prefix = botCount > 1 ? `[${bot.rank}] ` : "";
  const stdio = botCount > 1 ? ["ignore", "pipe", "pipe"] : "inherit";
  const args = [
    bot.patchedGtp2ogsPath,
    "--apikey",
    bot.apiKey,
    "--config",
    bot.generatedGtp2ogsConfigPath,
    ...splitArgs(process.env.GTP2OGS_EXTRA_ARGS),
    ...splitArgs(envForBot("GTP2OGS_EXTRA_ARGS", bot.key) || ""),
    "--",
    ...katagoArgsFor(bot.katagoConfigPath),
  ];

  console.error(
    `${prefix}Starting gtp2ogs with ${katagoBin()} using humanSLProfile=${bot.profile}; blitz/rapid/live, one game total, no handicap, one game per opponent per UTC day`,
  );

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    stdio,
    env: {
      ...process.env,
      NODE_PATH: path.join(repoRoot, "node_modules"),
    },
  });

  if (botCount > 1) {
    prefixStream(child.stdout, process.stdout, prefix);
    prefixStream(child.stderr, process.stderr, prefix);
  }

  return child;
}
