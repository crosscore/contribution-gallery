import { Scene } from "./kit";
import { plasma } from "./plasma";
import { constellation } from "./constellation";
import { tide } from "./tide";
import { codeRain } from "./code-rain";
import { pathfinder } from "./pathfinder";
import { life } from "./life";
import { sort } from "./sort";
import { pong } from "./pong";
import { heartbeat } from "./heartbeat";

/** The gallery's nine scenes; the render seed shuffles their order. */
export const SCENES: Scene[] = [plasma, constellation, tide, codeRain, pathfinder, life, sort, pong, heartbeat];

export * from "./kit";
