import { sequence, transition } from 'visdelta';

// Application integration example, not an additional VisDelta public API.
// Each effect/render generation owns its own mount. An old asynchronous
// creation can therefore never replace a newer chart's contents.
export function mountStory(host, states) {
  if (!host.isConnected) throw new Error('Attach the chart host before mounting.');
  if (!Array.isArray(states) || !states.length) throw new Error('A story needs at least one state.');
  const authored = [...states];
  const mount = document.createElement('div');
  mount.style.cssText = 'width:100%;height:100%;min-width:0;';
  host.append(mount);
  let disposed = false;
  let controller = null;
  let position = 0;
  const last = authored.length - 1;

  const ready = (async () => {
    let created;
    try {
      const options = { target: mount, width: 'auto', height: 'auto' };
      created = last
        ? await sequence(authored, options)
        : await transition(authored[0], authored[0], options);
      if (disposed) { created.destroy(); return null; }
      created.progress(last ? position : 1);
      controller = created;
      return created;
    } catch (error) {
      created?.destroy();
      mount.remove();
      throw error; // The application displays current-generation errors.
    }
  })();

  return {
    ready, // This Promise belongs to this example, not the library controller.
    get value() { return position; },
    seek(next) {
      if (disposed) throw new Error('This story mount has been destroyed.');
      if (!Number.isFinite(next)) throw new Error('Story position must be finite.');
      position = Math.max(0, Math.min(last, next));
      controller?.progress(last ? position : 1);
    },
    resize() {
      if (!disposed) controller?.resize();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      controller?.destroy();
      mount.remove();
    },
  };
}
