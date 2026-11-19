/**
 * The two bodies, in pixels, in one place — because the level's roof is drawn to these numbers.
 *
 * The guard is 44 px tall and the corridor is 64 px deep, so a 28 px body can rise 36 px under the
 * rock and no further: the feet can never get above a guard's head, which is what makes "go by" a
 * roll instead of a jump. The test reads all three numbers from here rather than repeating them.
 */
export const PLAYER_SIZE = { w: 20, h: 28 } as const;

export const ENEMY_SIZE = { w: 20, h: 44 } as const;
