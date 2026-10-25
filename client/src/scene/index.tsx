// STUB. The 3D agent replaces this whole folder. Contract:
//   - default export <Scene /> fills its parent (position absolute, inset 0)
//   - registers a SceneApi via useSceneStore.getState().registerApi(...) on mount
//   - sets selectedObjectId on tap, hoveredObjectId on hover, focusObjectId + cameraPos on camera move
//   - colors driven by useClaims() and usePlayer(): unclaimed white, claimed crew color, own gold pulse
import { useEffect } from 'react';
import { useObjects, useSceneStore } from '../state';

export function Scene() {
  const { list, loaded } = useObjects();
  const select = useSceneStore(s => s.select);
  const registerApi = useSceneStore(s => s.registerApi);

  useEffect(() => {
    registerApi({
      flyTo: id => select(id),
      teleport: () => {
        if (list.length) select(list[Math.floor(Math.random() * list.length)].id);
      },
      playClaimAnimation: () => { /* stub */ },
    });
    return () => registerApi(null);
  }, [list, select, registerApi]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'grid', placeItems: 'center', color: '#555', fontFamily: 'monospace' }}>
      {loaded ? `scene stub: ${list.length} objects loaded` : 'loading objects.json'}
    </div>
  );
}
