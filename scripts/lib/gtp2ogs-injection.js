/* eslint-disable */
//
// This file is NEVER executed. Its source text is read by gtp2ogs-patch.mjs
// and spliced into the bundled gtp2ogs.js. It lives here as real JavaScript so
// that the injected methods get syntax highlighting, formatting, and parse
// checking instead of being buried in template-literal strings.
//
// The methods reference gtp2ogs bundle internals that are undefined in this
// file on purpose: `socket_1`, `config_1`, `trace_1`, `require`, and `this`
// (bound to the bundle's Main instance). Do not try to import or define them.
//
// Build-time substitution: "__DAILY_OPPONENT_STATE_PATH__" is replaced with the
// JSON-encoded daily-opponent state path for the bot being launched.
//
// Each // #region NAME ... // #endregion NAME block is extracted verbatim and
// injected at a matching anchor in the bundle. Keep the method indentation at
// 4 spaces to match the bundle's compiled output.

class InjectedGtp2ogsMethods {
    // #region dailyOpponentMethods
    getDailyOpponentState() {
        const fs = require("fs");
        const path = require("path");
        const statePath = "__DAILY_OPPONENT_STATE_PATH__";
        const day = new Date().toISOString().slice(0, 10);
        try {
            const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
            if (raw.day === day && Array.isArray(raw.opponent_ids)) {
                return { statePath, day, opponent_ids: raw.opponent_ids.map((id) => id.toString()) };
            }
        }
        catch (_e) {
            // Missing or invalid state starts a fresh UTC day.
        }
        return { statePath, day, opponent_ids: [] };
    }
    checkDailyOpponentLimit(user) {
        const state = this.getDailyOpponentState();
        if (state.opponent_ids.includes(user.id.toString())) {
            return {
                message: `This bot only accepts one game per opponent per UTC day.`,
                rejection_code: "daily_opponent_limit",
                details: { opponent_id: user.id, day: state.day },
            };
        }
        return undefined;
    }
    checkGlobalConcurrentGames() {
        const count = Object.keys(this.connected_games).length;
        if (count >= 1) {
            return {
                message: `This bot is already playing a game.`,
                rejection_code: "too_many_games",
                details: { count, allowed: 1 },
            };
        }
        return undefined;
    }
    checkHumanOpponent(user) {
        if (user && (user.is_bot || user.bot || user.isBot || user.ui_class === "bot")) {
            return {
                message: `This bot only accepts games from human opponents.`,
                rejection_code: "humans_only",
                details: { opponent_id: user.id, username: user.username },
            };
        }
        return undefined;
    }
    recordDailyOpponent(user) {
        const fs = require("fs");
        const path = require("path");
        const state = this.getDailyOpponentState();
        const opponentId = user.id.toString();
        if (!state.opponent_ids.includes(opponentId)) {
            state.opponent_ids.push(opponentId);
        }
        fs.mkdirSync(path.dirname(state.statePath), { recursive: true });
        fs.writeFileSync(
            state.statePath,
            JSON.stringify({ day: state.day, opponent_ids: state.opponent_ids }, null, 2) + "\n",
        );
    }
    // #endregion dailyOpponentMethods

    // #region reconciliationMethods
    fetchPendingChallenges() {
        return new Promise((resolve, reject) => {
            const url = new URL("/api/v1/me/challenges", config_1.config.server);
            const accessToken = process.env.OGS_REST_ACCESS_TOKEN;
            if (!accessToken) {
                resolve([]);
                return;
            }
            const transport = url.protocol === "http:" ? require("http") : require("https");
            const request = transport.get(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }, (response) => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    body += chunk;
                });
                response.on("end", () => {
                    if (response.statusCode < 200 || response.statusCode > 299) {
                        reject(new Error(`HTTP ${response.statusCode} fetching pending challenges: ${body}`));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(body);
                        resolve(Array.isArray(parsed) ? parsed : parsed.results || []);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            request.setTimeout(5000, () => {
                request.destroy(new Error("Timed out fetching pending challenges"));
            });
            request.on("error", reject);
        });
    }
    normalizePendingChallenge(challenge) {
        const challenge_id = challenge.challenge_id ?? challenge.id;
        if (!challenge_id) {
            return null;
        }
        return Object.assign({}, challenge, {
            type: "challenge",
            challenge_id,
        });
    }
    async reconcilePendingChallenges() {
        if (!this.connected || !config_1.config.bot_id) {
            return;
        }
        try {
            const challenges = await this.fetchPendingChallenges();
            for (const challenge of challenges) {
                const notification = this.normalizePendingChallenge(challenge);
                if (notification) {
                    this.handleNotification(notification);
                }
            }
        }
        catch (error) {
            trace_1.trace.warn("Unable to reconcile pending challenges", error);
        }
    }
    deleteNotification(notification) {
        if (!notification.id) {
            return;
        }
        socket_1.socket.send("notification/delete", { notification_id: notification.id }, () => {
            trace_1.trace.trace("Deleted notification ", notification.id);
        });
    }
    // #endregion reconciliationMethods

    // #region shutdownMethods
    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.reconcile_challenges_interval);
    }
    shutdown(signal) {
        if (this.shutting_down) {
            return;
        }
        this.shutting_down = true;
        trace_1.trace.warn(`Received ${signal}, disconnecting cleanly`);
        for (const game_id in this.connected_games) {
            this.disconnectFromGame(parseInt(game_id));
        }
        try {
            if (socket_1.socket.connected && typeof socket_1.socket.send === "function") {
                socket_1.socket.send("bot/status", {
                    ongoing_blitz_count: 0,
                    ongoing_rapid_count: 0,
                    ongoing_live_count: 0,
                    ongoing_correspondence_count: 0,
                });
            }
            if (typeof socket_1.socket.close === "function") {
                socket_1.socket.close();
            }
            else if (typeof socket_1.socket.disconnect === "function") {
                socket_1.socket.disconnect();
            }
        }
        catch (e) {
            trace_1.trace.warn("Error during shutdown", e);
        }
        setTimeout(() => process.exit(0), 500);
    }
    // #endregion shutdownMethods
}
