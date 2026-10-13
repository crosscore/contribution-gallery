import { Scene } from "./kit";
import { plasma } from "./plasma";
import { constellation } from "./constellation";
import { tide } from "./tide";
import { aurora } from "./aurora";
import { pathfinder } from "./pathfinder";
import { life } from "./life";
import { sort } from "./sort";
import { pong } from "./pong";
import { fireworks } from "./fireworks";
import { ripples } from "./ripples";

/** The gallery's ten scenes; the render seed shuffles their order. */
export const SCENES: Scene[] = [plasma, constellation, tide, aurora, pathfinder, life, sort, pong, fireworks, ripples];

export * from "./kit";
