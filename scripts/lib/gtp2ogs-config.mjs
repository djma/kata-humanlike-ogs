import { katagoArgsFor, endingConfigPath } from "./katago.mjs";

export function buildGtp2ogsConfig(bot, katagoConfigPath, greeting) {
  const katagoArgs = katagoArgsFor(katagoConfigPath);
  return {
    engine: `KataGo humanSL ${bot.profile}`,
    bot: {
      command: katagoArgs,
      manager: "persistent",
      release_delay: 100,
    },
    ending_bot: {
      command: katagoArgsFor(endingConfigPath, { includeHumanModel: false }),
      manager: "persistent",
      release_delay: 100,
      allowed_resigns: 3,
      moves_to_allow_before_checking_ratio: 0.55,
    },
    allowed_blitz_settings: {
      simple: {
        per_move_time_range: [5, 30],
      },
      byoyomi: {
        main_time_range: [0, 3600],
        period_time_range: [5, 30],
        periods_range: [1, 10],
      },
      fischer: {
        initial_time_range: [5, 600],
        max_time_range: [5, 7200],
        time_increment_range: [3, 30],
      },
      concurrent_games: 1,
    },
    allowed_rapid_settings: {
      simple: {
        per_move_time_range: [5, 30],
      },
      byoyomi: {
        main_time_range: [0, 3600],
        period_time_range: [5, 30],
        periods_range: [1, 10],
      },
      fischer: {
        initial_time_range: [5, 600],
        max_time_range: [5, 7200],
        time_increment_range: [3, 30],
      },
      concurrent_games: 1,
    },
    allowed_live_settings: {
      simple: {
        per_move_time_range: [10, 300],
      },
      byoyomi: {
        main_time_range: [0, 3600],
        period_time_range: [10, 300],
        periods_range: [1, 10],
      },
      fischer: {
        initial_time_range: [10, 3600],
        max_time_range: [5, 7200],
        time_increment_range: [10, 300],
      },
      concurrent_games: 1,
    },
    allowed_correspondence_settings: null,
    allowed_board_sizes: [9, 13, 19],
    allow_ranked_handicap: false,
    allow_unranked_handicap: false,
    max_games_per_player: 1,
    min_move_time: 1500,
    greeting: {
      en: greeting,
    },
    farewell: {
      en: "Thank you for the game!",
    },
  };
}
