import fs from "node:fs";
import path from "node:path";
import { repoRoot, envForBot } from "./env.mjs";

export const katagoBin = process.env.KATAGO_BIN || "/opt/homebrew/bin/katago";
export const katagoModel =
  process.env.KATAGO_MODEL ||
  "/Users/davidma/.katrain/kata1-b28c512nbt-s12704148736-d5790336910.bin.gz";
export const humanModel =
  process.env.KATAGO_HUMAN_MODEL || "/Users/davidma/.katrain/b18c384nbt-humanv0.bin.gz";

const baseConfig = process.env.KATAGO_CONFIG || "config/katago-human-rank-5k.cfg";
export const baseConfigPath = configPathFor(baseConfig);

const endingConfig = process.env.KATAGO_ENDING_CONFIG || "config/katago-ending.cfg";
export const endingConfigPath = configPathFor(endingConfig);

export function configPathFor(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

export function katagoArgsFor(katagoConfigPath, { includeHumanModel = true } = {}) {
  const args = [katagoBin, "gtp", "-model", katagoModel];

  if (includeHumanModel) {
    args.push("-human-model", humanModel);
  }

  args.push("-config", katagoConfigPath);

  if (process.env.KATAGO_OVERRIDE_CONFIG) {
    args.push("-override-config", process.env.KATAGO_OVERRIDE_CONFIG);
  }

  return args;
}

export function materializeRankConfig(bot, tempRoot) {
  const sourcePath = configPathFor(envForBot("KATAGO_CONFIG", bot.key) || baseConfigPath);
  let config = fs.readFileSync(sourcePath, "utf8");
  if (/^humanSLProfile\s*=.*$/m.test(config)) {
    config = config.replace(/^humanSLProfile\s*=.*$/m, `humanSLProfile = ${bot.profile}`);
  } else {
    config = `${config.trimEnd()}\n\nhumanSLProfile = ${bot.profile}\n`;
  }

  const outputPath = path.join(tempRoot, `katago-human-${bot.rank}.cfg`);
  fs.writeFileSync(outputPath, config);
  return outputPath;
}
