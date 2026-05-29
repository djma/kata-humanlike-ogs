import fs from "node:fs";
import path from "node:path";
import { repoRoot, envForBot, requiredEnv } from "./env.mjs";

const defaultKatagoBin = "katago";
const defaultBaseConfig = "config/katago-human-rank-5k.cfg";
const defaultEndingConfig = "config/katago-ending.cfg";

export function katagoBin() {
  return process.env.KATAGO_BIN || defaultKatagoBin;
}

export function katagoModel() {
  return requiredEnv("KATAGO_MODEL");
}

export function humanModel() {
  return requiredEnv("KATAGO_HUMAN_MODEL");
}

export function baseConfigPath() {
  return configPathFor(process.env.KATAGO_CONFIG || defaultBaseConfig);
}

export function endingConfigPath() {
  return configPathFor(process.env.KATAGO_ENDING_CONFIG || defaultEndingConfig);
}

export function configPathFor(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

export function katagoArgsFor(katagoConfigPath, { includeHumanModel = true } = {}) {
  const args = [katagoBin(), "gtp", "-model", katagoModel()];

  if (includeHumanModel) {
    args.push("-human-model", humanModel());
  }

  args.push("-config", katagoConfigPath);

  if (process.env.KATAGO_OVERRIDE_CONFIG) {
    args.push("-override-config", process.env.KATAGO_OVERRIDE_CONFIG);
  }

  return args;
}

export function materializeRankConfig(bot, tempRoot) {
  const sourcePath = configPathFor(envForBot("KATAGO_CONFIG", bot.key) || baseConfigPath());
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
