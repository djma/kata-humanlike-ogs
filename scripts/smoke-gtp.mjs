#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { loadDotEnv, repoRoot } from "./lib/env.mjs";

loadDotEnv();

const katagoBin = process.env.KATAGO_BIN || "/opt/homebrew/bin/katago";
const config = process.env.KATAGO_CONFIG || "config/katago-human-rank-5k.cfg";
const configPath = path.isAbsolute(config) ? config : path.join(repoRoot, config);
const katagoModel =
  process.env.KATAGO_MODEL ||
  "/Users/davidma/.katrain/kata1-b28c512nbt-s12704148736-d5790336910.bin.gz";
const humanModel =
  process.env.KATAGO_HUMAN_MODEL || "/Users/davidma/.katrain/b18c384nbt-humanv0.bin.gz";

const args = [
  "gtp",
  "-model",
  katagoModel,
  "-human-model",
  humanModel,
  "-config",
  configPath,
];

if (process.env.KATAGO_OVERRIDE_CONFIG) {
  args.push("-override-config", process.env.KATAGO_OVERRIDE_CONFIG);
}

const child = spawn(katagoBin, args, { cwd: repoRoot });
let stdout = "";
let stderr = "";

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const commands = [
  "protocol_version",
  "name",
  "boardsize 19",
  "clear_board",
  "komi 6.5",
  "play B D4",
  "genmove W",
  "quit",
];

for (const command of commands) {
  child.stdin.write(`${command}\n`);
}
child.stdin.end();

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
  console.error("Timed out waiting for KataGo GTP smoke test.");
  process.exit(1);
}, 60_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  const responses = stdout
    .split(/\n\n+/)
    .map((response) => response.trim())
    .filter(Boolean);
  const generated = responses.find((response) => /^=\s+\S+/m.test(response));

  if (code !== 0 && code !== null) {
    console.error(stderr.trim());
    process.exit(code);
  }
  if (!generated) {
    console.error("KataGo did not return a GTP move.");
    console.error(stdout.trim());
    console.error(stderr.trim());
    process.exit(1);
  }

  console.log(stdout.trim());
});
