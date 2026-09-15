// Scene progress controllers.
//
// A rendered scene accumulates recorded track items (see ./runtime/recorder.ts)
// while its chart module draws; this turns that batch into one controller the
// transition surface can seek, compile, and finish. There is no other source
// of tracks: nothing reads D3's private transition schedule any more.
import { createProgressController } from './runtime/tracks.js';
import type { ProgressController } from './runtime/tracks.js';
import { drainRecordedTracks } from './runtime/recorder.js';

export { directionalEase } from './runtime/tracks.js';

export interface SceneProgressHost {
  transitionProgress?: ProgressController | null;
}

/** One controller per rendered scene, built from everything recorded since the last one. */
export function createSceneTransitionProgress(scene: object): ProgressController {
  return createProgressController(drainRecordedTracks(scene));
}

export function clearSceneTransitionProgress(scene: SceneProgressHost | null | undefined, { finish = true } = {}): void {
  if (!scene) return;
  // Items recorded after the last controller was built belong to a render
  // that is being discarded; drop them with it.
  drainRecordedTracks(scene);
  if (!scene.transitionProgress) return;
  scene.transitionProgress.destroy({ finish });
  scene.transitionProgress = null;
}
