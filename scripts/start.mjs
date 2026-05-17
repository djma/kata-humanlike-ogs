#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadDotEnv, repoRoot, requiredEnv, splitArgs } from "./env.mjs";

loadDotEnv();

const gtp2ogsBin = path.join(repoRoot, "node_modules", ".bin", "gtp2ogs");
if (!fs.existsSync(gtp2ogsBin)) {
  throw new Error("gtp2ogs is not installed. Run `npm install` first.");
}

const katagoBin = process.env.KATAGO_BIN || "/opt/homebrew/bin/katago";
const katagoModel =
  process.env.KATAGO_MODEL ||
  "/Users/davidma/.katrain/kata1-b28c512nbt-s12704148736-d5790336910.bin.gz";
const humanModel =
  process.env.KATAGO_HUMAN_MODEL || "/Users/davidma/.katrain/b18c384nbt-humanv0.bin.gz";
const config = process.env.KATAGO_CONFIG || "config/katago-human-rank-5k.cfg";
const configPath = path.isAbsolute(config) ? config : path.join(repoRoot, config);

const katagoArgs = [
  katagoBin,
  "gtp",
  "-model",
  katagoModel,
  "-human-model",
  humanModel,
  "-config",
  configPath,
];

if (process.env.KATAGO_OVERRIDE_CONFIG) {
  katagoArgs.push("-override-config", process.env.KATAGO_OVERRIDE_CONFIG);
}

const args = [
  "--apikey",
  requiredEnv("OGS_API_KEY"),
  ...splitArgs(process.env.GTP2OGS_EXTRA_ARGS),
  "--",
  ...katagoArgs,
];

console.error(`Starting gtp2ogs with ${katagoBin} using humanSLProfile=rank_5k`);
const child = spawn(gtp2ogsBin, args, {
  cwd: repoRoot,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
