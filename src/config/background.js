/**
 * Background switch.
 *
 * false -> StaticSpaceBackground: the same space scene (stars, nebula, Earth, satellites)
 *          drawn ONCE and only redrawn when the window is resized. No animation loop,
 *          no mouse tracking — zero ongoing CPU/GPU cost.
 * true  -> SpaceBackground: the original animated, mouse-reactive scene.
 *
 * To go back to the animated background, set this to true. Nothing else needs to change.
 */
export const ANIMATED_SPACE_BACKGROUND = true;
