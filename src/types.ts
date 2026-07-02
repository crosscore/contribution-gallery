// ============================================================
// Type definitions for contribution-gallery
// ============================================================

/** Direction a snake can move */
export enum Direction {
  Up = "up",
  Down = "down",
  Left = "left",
  Right = "right",
}

/** Contribution level (0 = no contributions, 4 = max) */
export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

/** Owner of a cell's territory */
export enum CellOwner {
  None = "none",
  Snake1 = "snake1",
  Snake2 = "snake2",
}

/** A single cell on the grid */
export interface Cell {
  /** Column index (0-51 for a year) */
  x: number;
  /** Row index (0-6, Sun-Sat) */
  y: number;
  /** Original contribution level */
  contributionLevel: ContributionLevel;
  /** Which snake owns this cell (after painting) */
  owner: CellOwner;
}

/** The full grid state */
export interface Grid {
  /** 2D array indexed as [x][y] */
  cells: Cell[][];
  /** Number of columns */
  width: number;
  /** Number of rows (always 7) */
  height: number;
}

/** Position on the grid */
export interface Position {
  x: number;
  y: number;
}

/** State of a single snake */
export interface Snake {
  /** Unique identifier */
  id: CellOwner.Snake1 | CellOwner.Snake2;
  /** Current head position */
  position: Position;
  /** Trail of positions visited (head at the end) */
  trail: Position[];
  /** Whether this snake is still active */
  alive: boolean;
}

/** A single frame / turn in the game history */
export interface GameFrame {
  /** Turn number */
  turn: number;
  /** Deep copy of grid state at this turn */
  grid: Grid;
  /** Deep copy of both snakes at this turn */
  snakes: [Snake, Snake];
  /** Score at this turn */
  score: GameScore;
}

/** Score information */
export interface GameScore {
  snake1: number;
  snake2: number;
  /** Total paintable cells */
  total: number;
}

/** Winner of the game */
export type GameWinner = "snake1" | "snake2" | "draw";

/** Full game result */
export interface GameResult {
  /** All frames from start to finish */
  frames: GameFrame[];
  /** Final score */
  finalScore: GameScore;
  /** Who won the game */
  winner: GameWinner;
}

/** AI strategy type */
export type Strategy = "aggressive" | "balanced" | "random";

/** Configuration for the game */
export interface GameConfig {
  /** Grid width (default 52) */
  gridWidth: number;
  /** Grid height (default 7) */
  gridHeight: number;
  /** AI strategy */
  strategy: Strategy;
}

/** Color palette for rendering */
export interface ColorPalette {
  /** Background color */
  background: string;
  /** Empty cell color */
  emptyCell: string;
  /** Contribution level colors (index 0-4) */
  contributionColors: [string, string, string, string, string];
  /** Snake 1 body color */
  snake1Color: string;
  /** Snake 1 trail color */
  snake1Trail: string;
  /** Snake 2 body color */
  snake2Color: string;
  /** Snake 2 trail color */
  snake2Trail: string;
  /** Text color for score display */
  textColor: string;
}

/** Render configuration */
export interface RenderConfig {
  /** Cell size in pixels */
  cellSize: number;
  /** Gap between cells */
  cellGap: number;
  /** Border radius of cells */
  cellRadius: number;
  /** Animation duration per frame in ms */
  frameDuration: number;
  /** Color palette */
  palette: ColorPalette;
  /** Whether dark mode */
  darkMode: boolean;
}

/** Default light palette — Splatoon-inspired: Hot Pink × Cyan */
export const DEFAULT_LIGHT_PALETTE: ColorPalette = {
  background: "#ffffff",
  emptyCell: "#ebedf0",
  contributionColors: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  snake1Color: "#E8006A",   // Splatoon hot pink (body)
  snake1Trail: "#FF85AA",   // lighter pink (trail / painted cells)
  snake2Color: "#008CC8",   // Splatoon cyan (body)
  snake2Trail: "#5DD4FF",   // lighter cyan (trail / painted cells)
  textColor: "#24292f",
};

/** Default dark palette — Splatoon-inspired: Hot Pink × Cyan (dark mode) */
export const DEFAULT_DARK_PALETTE: ColorPalette = {
  background: "#010409",
  emptyCell: "#161b22",
  contributionColors: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  snake1Color: "#FF2D78",   // Splatoon hot pink vivid (body)
  snake1Trail: "#FF85AA",   // lighter pink (trail)
  snake2Color: "#00BFFF",   // Splatoon cyan vivid (body)
  snake2Trail: "#5DD4FF",   // lighter cyan (trail)
  textColor: "#c9d1d9",
};

/** Default render config */
export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  cellSize: 11,
  cellGap: 3,
  cellRadius: 2,
  frameDuration: 80,
  palette: DEFAULT_LIGHT_PALETTE,
  darkMode: false,
};

/** Default game config */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  gridWidth: 52,
  gridHeight: 7,
  strategy: "aggressive",
};
