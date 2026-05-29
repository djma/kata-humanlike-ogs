import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./env.mjs";

export const gtp2ogsDist = path.join(repoRoot, "node_modules", "gtp2ogs", "dist", "gtp2ogs.js");
const injectionSourcePath = new URL("./gtp2ogs-injection.js", import.meta.url);

export function assertGtp2ogsInstalled() {
  if (!fs.existsSync(gtp2ogsDist)) {
    throw new Error("gtp2ogs dist file is missing. Run `npm install` first.");
  }
}

// Extract each `// #region NAME ... // #endregion NAME` block from the sidecar
// source verbatim. These blocks are spliced into the gtp2ogs bundle below.
function loadInjectionRegions() {
  const source = fs.readFileSync(injectionSourcePath, "utf8");
  const regions = {};
  const re = /\/\/ #region (\w+)\n([\s\S]*?)\n[ \t]*\/\/ #endregion \1/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    regions[match[1]] = match[2];
  }
  for (const name of ["dailyOpponentMethods", "reconciliationMethods", "shutdownMethods"]) {
    if (!regions[name]) {
      throw new Error(`Missing injection region "${name}" in gtp2ogs-injection.js`);
    }
  }
  return regions;
}

export function patchGtp2ogs(dailyOpponentStatePath, outputPath) {
  const regions = loadInjectionRegions();
  const gtp2ogsSource = fs.readFileSync(gtp2ogsDist, "utf8");

  const logOnlyUndoHandler = `        const on_undo_requested = (undo_data) => {
            this.log("Undo requested", JSON.stringify(undo_data, null, 4));
        };`;
  const declineUndoHandler = `        const on_undo_requested = (undo_data) => {
            this.log("Declining undo request", JSON.stringify(undo_data, null, 4));
            const move_number = undo_data && typeof undo_data === "object"
                ? (undo_data.move_number ?? undo_data.move)
                : undo_data;
            if (move_number === undefined || move_number === null) {
                this.warn("Unable to decline undo request without a move number");
                return;
            }
            socket_1.socket.send("game/undo/cancel", {
                game_id: game_id,
                move_number,
            });
        };`;
  let patchedGtp2ogsSource = gtp2ogsSource.replace(logOnlyUndoHandler, declineUndoHandler);
  if (patchedGtp2ogsSource === gtp2ogsSource) {
    throw new Error("Unable to patch gtp2ogs undo handling.");
  }

  const speedConcurrentCheck = `                        this.checkConcurrentGames(notification.time_control.speed) ||`;
  const globalAndSpeedConcurrentCheck = `                        this.checkGlobalConcurrentGames() ||
                        this.checkConcurrentGames(notification.time_control.speed) ||`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    speedConcurrentCheck,
    globalAndSpeedConcurrentCheck,
  );
  if (!patchedGtp2ogsSource.includes("checkGlobalConcurrentGames()")) {
    throw new Error("Unable to patch gtp2ogs global concurrency check.");
  }

  const challengeAccept = `                    if (!reject) {
                        (0, util_1.post)((0, util_1.api1)(\`me/challenges/\${notification.challenge_id}/accept\`), {})
                            .then(ignore)
                            .catch(() => {`;
  const challengeAcceptWithDailyLimit = `                    if (!reject) {
                        reject = this.checkHumanOpponent(notification.user);
                    }
                    if (!reject) {
                        reject = this.checkDailyOpponentLimit(notification.user);
                    }
                    if (!reject) {
                        (0, util_1.post)((0, util_1.api1)(\`me/challenges/\${notification.challenge_id}/accept\`), {})
                            .then(() => this.recordDailyOpponent(notification.user))
                            .catch(() => {`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    challengeAccept,
    challengeAcceptWithDailyLimit,
  );
  if (!patchedGtp2ogsSource.includes("recordDailyOpponent(notification.user)")) {
    throw new Error("Unable to patch gtp2ogs daily opponent limit.");
  }

  const connectedFinishedGamesInit = `        this.connected_finished_games = {};
        //this.games_by_player = {}; // Keep track of connected games per player`;
  const pendingChallengeInit = `        this.connected_finished_games = {};
        this.pending_challenge_ids = new Set();
        this.reconcile_challenges_interval = null;
        //this.games_by_player = {}; // Keep track of connected games per player`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    connectedFinishedGamesInit,
    pendingChallengeInit,
  );
  if (!patchedGtp2ogsSource.includes("pending_challenge_ids")) {
    throw new Error("Unable to patch gtp2ogs pending challenge tracking.");
  }

  const sendBotConfig = `                socket_1.socket.send("bot/config", config_v2);`;
  const sendBotConfigAndReconcileChallenges = `                socket_1.socket.send("bot/config", config_v2);
                if (process.env.OGS_REST_ACCESS_TOKEN) {
                    this.reconcilePendingChallenges();
                }
                else {
                    trace_1.trace.warn("Pending challenge reconciliation is disabled; set OGS_REST_ACCESS_TOKEN to enable it");
                }
                if (process.env.OGS_REST_ACCESS_TOKEN && !this.reconcile_challenges_interval) {
                    this.reconcile_challenges_interval = setInterval(() => this.reconcilePendingChallenges(), 30000);
                }`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    sendBotConfig,
    sendBotConfigAndReconcileChallenges,
  );
  if (!patchedGtp2ogsSource.includes("reconcilePendingChallenges()")) {
    throw new Error("Unable to patch gtp2ogs challenge reconciliation startup.");
  }

  const challengeCaseStart = `            case "challenge":
                {
                    let reject = this.checkBlacklist(notification.user) ||`;
  const challengeCaseStartWithDedup = `            case "challenge":
                {
                    const challenge_id = notification.challenge_id ?? notification.id;
                    if (!challenge_id) {
                        trace_1.trace.warn("Ignoring challenge notification without a challenge id", notification);
                        break;
                    }
                    notification.challenge_id = challenge_id;
                    if (this.pending_challenge_ids.has(challenge_id)) {
                        trace_1.trace.debug("Already reconciling challenge", challenge_id);
                        break;
                    }
                    this.pending_challenge_ids.add(challenge_id);
                    const releaseChallenge = () => this.pending_challenge_ids.delete(challenge_id);
                    let reject = this.checkBlacklist(notification.user) ||`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    challengeCaseStart,
    challengeCaseStartWithDedup,
  );
  if (!patchedGtp2ogsSource.includes("releaseChallenge")) {
    throw new Error("Unable to patch gtp2ogs challenge deduplication.");
  }

  const acceptCatchEnd = `                            this.deleteNotification(notification);
                        });`;
  const acceptCatchEndWithFinally = `                            this.deleteNotification(notification);
                        })
                            .finally(releaseChallenge);`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(acceptCatchEnd, acceptCatchEndWithFinally);
  if (!patchedGtp2ogsSource.includes(".finally(releaseChallenge)")) {
    throw new Error("Unable to patch gtp2ogs accepted challenge release.");
  }

  const rejectCatch = `                            .catch(trace_1.trace.info);`;
  const rejectCatchWithFinally = `                            .catch(trace_1.trace.info)
                            .finally(releaseChallenge);`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(rejectCatch, rejectCatchWithFinally);
  const rejectChallengePost = `                            rejection_details: reject,
                        })
                            .then(ignore)
                            .catch(trace_1.trace.info);`;
  const rejectChallengePostWithFinally = `                            rejection_details: reject,
                        })
                            .then(ignore)
                            .catch(trace_1.trace.info)
                            .finally(releaseChallenge);`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    rejectChallengePost,
    rejectChallengePostWithFinally,
  );
  if ((patchedGtp2ogsSource.match(/finally\(releaseChallenge\)/g) || []).length < 3) {
    throw new Error("Unable to patch gtp2ogs rejected challenge release.");
  }

  const checkBlacklistMethod = `    checkBlacklist(user) {`;
  const dailyOpponentMethods = regions.dailyOpponentMethods.replace(
    '"__DAILY_OPPONENT_STATE_PATH__"',
    JSON.stringify(dailyOpponentStatePath),
  );
  const dailyLimitMethods = `${dailyOpponentMethods}\n${checkBlacklistMethod}`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(checkBlacklistMethod, dailyLimitMethods);
  if (
    !patchedGtp2ogsSource.includes("daily_opponent_limit") ||
    !patchedGtp2ogsSource.includes("humans_only")
  ) {
    throw new Error("Unable to patch gtp2ogs daily opponent methods.");
  }

  const deleteNotificationMethod = `    deleteNotification(notification) {
        socket_1.socket.send("notification/delete", { notification_id: notification.id }, () => {
            trace_1.trace.trace("Deleted notification ", notification.id);
        });
    }`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(
    deleteNotificationMethod,
    regions.reconciliationMethods,
  );
  if (!patchedGtp2ogsSource.includes("fetchPendingChallenges()")) {
    throw new Error("Unable to patch gtp2ogs pending challenge reconciliation methods.");
  }

  const terminateMethod = `    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
    }
}`;
  const gracefulTerminateMethod = `${regions.shutdownMethods}\n}`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(terminateMethod, gracefulTerminateMethod);
  const mainStartup = `new Main();`;
  const mainStartupWithSignals = `const main = new Main();
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => main.shutdown(signal));
}`;
  patchedGtp2ogsSource = patchedGtp2ogsSource.replace(mainStartup, mainStartupWithSignals);
  if (!patchedGtp2ogsSource.includes("disconnecting cleanly")) {
    throw new Error("Unable to patch gtp2ogs graceful shutdown.");
  }

  fs.writeFileSync(outputPath, patchedGtp2ogsSource);
}
