import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDotEnv } from "../scripts/lib/env.mjs";
import {
  baseConfigPath,
  endingConfigPath,
  katagoArgsFor,
} from "../scripts/lib/katago.mjs";

const katagoEnvNames = [
  "KATAGO_BIN",
  "KATAGO_MODEL",
  "KATAGO_HUMAN_MODEL",
  "KATAGO_CONFIG",
  "KATAGO_ENDING_CONFIG",
  "KATAGO_OVERRIDE_CONFIG",
];

function withCleanKatagoEnv(run) {
  const previous = new Map(katagoEnvNames.map((name) => [name, process.env[name]]));
  for (const name of katagoEnvNames) {
    delete process.env[name];
  }

  try {
    run();
  } finally {
    for (const name of katagoEnvNames) {
      const value = previous.get(name);
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("KataGo settings reflect dotenv values loaded after module import", () => {
  withCleanKatagoEnv(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kata-env-test-"));
    const dotenvPath = path.join(tempDir, ".env");
    fs.writeFileSync(
      dotenvPath,
      [
        "KATAGO_BIN=/srv/bin/katago",
        "KATAGO_MODEL=/srv/models/full.bin.gz",
        "KATAGO_HUMAN_MODEL=/srv/models/human.bin.gz",
        "KATAGO_CONFIG=/srv/config/rank.cfg",
        "KATAGO_ENDING_CONFIG=/srv/config/ending.cfg",
        "KATAGO_OVERRIDE_CONFIG=maxVisits=64",
        "",
      ].join("\n"),
    );

    loadDotEnv(dotenvPath);

    assert.deepEqual(katagoArgsFor("/tmp/generated.cfg"), [
      "/srv/bin/katago",
      "gtp",
      "-model",
      "/srv/models/full.bin.gz",
      "-human-model",
      "/srv/models/human.bin.gz",
      "-config",
      "/tmp/generated.cfg",
      "-override-config",
      "maxVisits=64",
    ]);
    assert.equal(baseConfigPath(), "/srv/config/rank.cfg");
    assert.equal(endingConfigPath(), "/srv/config/ending.cfg");
  });
});
