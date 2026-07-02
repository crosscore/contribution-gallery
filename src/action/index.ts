import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { fetchContributions } from "../fetcher";
import { runGame } from "../game/engine";
import { renderAnimatedSVG } from "../renderer/animation";
import { renderAmbientSVG } from "../renderer/ambient";
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_RENDER_CONFIG,
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_DARK_PALETTE,
  RenderConfig,
  GameConfig,
  GameResult,
} from "../types";

async function run(): Promise<void> {
  try {
    const username = core.getInput("github_user_name", { required: true });
    const token = core.getInput("github_token") || undefined;
    const outputsRaw = core.getInput("outputs") || "dist/splatoon.svg";
    const strategy =
      (core.getInput("strategy") as GameConfig["strategy"]) || "aggressive";

    // Parse custom colors
    const snake1Color = core.getInput("color_snake_1") || "#FF6B00";
    const snake2Color = core.getInput("color_snake_2") || "#7B3FF2";
    const trail1Color = core.getInput("color_trail_1") || "#FFB366";
    const trail2Color = core.getInput("color_trail_2") || "#B088F9";

    core.info(`🦑 Fetching contributions for ${username}...`);
    const grid = await fetchContributions(username, token);

    core.info(
      `📊 Grid: ${grid.width}x${grid.height} (${grid.width * grid.height} cells)`
    );

    // Game simulation is only needed for splatoon outputs — run it lazily
    let gameResult: GameResult | null = null;
    const getGameResult = (): GameResult => {
      if (!gameResult) {
        const gameConfig: GameConfig = {
          ...DEFAULT_GAME_CONFIG,
          strategy,
        };
        core.info(`🎮 Running game simulation (strategy: ${strategy})...`);
        gameResult = runGame(grid, gameConfig);
        core.info(
          `✅ Game finished in ${gameResult.frames.length} turns. Score: ${gameResult.finalScore.snake1} vs ${gameResult.finalScore.snake2}`
        );
      }
      return gameResult;
    };

    // Ambient scene order rotates daily
    const ambientSeed = Math.floor(Date.now() / 86_400_000);

    // Parse output file paths (path?palette=dark&mode=ambient)
    const outputs = outputsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const output of outputs) {
      const [filePath, query = ""] = output.split("?");
      const params = new URLSearchParams(query);
      const isDark = params.get("palette") === "dark";
      const mode = params.get("mode") === "ambient" ? "ambient" : "splatoon";

      const renderConfig: RenderConfig = {
        ...DEFAULT_RENDER_CONFIG,
        darkMode: isDark,
        palette: {
          ...(isDark ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE),
          snake1Color,
          snake1Trail: trail1Color,
          snake2Color,
          snake2Trail: trail2Color,
        },
      };

      core.info(`🎨 Rendering ${mode} ${isDark ? "dark" : "light"} → ${filePath}...`);
      const svg =
        mode === "ambient"
          ? renderAmbientSVG(grid, renderConfig, ambientSeed)
          : renderAnimatedSVG(getGameResult(), renderConfig);

      // Ensure output directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, svg, "utf-8");
      core.info(`📁 Saved: ${filePath} (${(svg.length / 1024).toFixed(1)} KB)`);
    }

    core.info("🎉 Done!");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
  }
}

run();
