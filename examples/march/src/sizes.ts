/**
 * The two bodies, in pixels, in one place — because the level's roof is drawn to these numbers.
 *
 * The guard is 44 px tall and the corridor is 64 px deep, so a 28 px body can rise 36 px under the
 * rock and no further: the feet can never get above a guard's head, which is what makes "go by" a
 * roll instead of a jump. The test reads all three numbers from here rather than repeating them.
 */
export const PLAYER_SIZE = { w: 20, h: 28 } as const;

export const ENEMY_SIZE = { w: 20, h: 44 } as const;

/**
 * How fast the player runs, px/s — here rather than in `main.ts` so that the one rule about it that a
 * test can check (`a guard you walked past must be able to close this gap`) has both numbers in one
 * file. It is not a size, but it is the same kind of fact: what the road is built against.
 */
export const PLAYER_RUN_PX_PER_SECOND = 300;
