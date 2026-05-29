import https from "node:https";

export function fetchJson(url, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} from ${url}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
    request.on("error", reject);
  });
}

export async function loadSharedGreeting() {
  if (process.env.OGS_PROFILE_DESCRIPTION?.trim()) {
    return process.env.OGS_PROFILE_DESCRIPTION.trim();
  }

  const playerId = process.env.OGS_BOT_PLAYER_ID_5K;
  if (playerId) {
    try {
      const profile = await fetchJson(`https://online-go.com/api/v1/players/${playerId}`);
      if (typeof profile.about === "string" && profile.about.trim()) {
        return profile.about.trim();
      }
    } catch (error) {
      console.error(`[5k] Could not fetch OGS profile description: ${error.message}`);
    }
  }

  return "Hello, I am a KataGo human-like bot. Good luck, have fun!";
}
