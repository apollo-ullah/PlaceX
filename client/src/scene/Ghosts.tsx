// Presence ghosts: other players' camera targets from usePresence() drawn as tiny crew-coloured
// ships hovering over the object they are looking at. One InstancedMesh, eased between updates.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color, ConeGeometry, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial,
  Object3D, Vector3,
} from 'three';
import { useObjects, usePresence } from '../state';
import { CREWS } from '../types';
import { visualRadius, worldPosition } from './layout';

const MAX_GHOSTS = 64;
const geometry = new ConeGeometry(0.35, 1, 6);
geometry.rotateX(Math.PI / 2); // nose along +Z so lookAt points it at the target
const material = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });

interface Ghost { pos: Vector3; target: Vector3; look: Vector3; color: Color; phase: number }

export function Ghosts() {
  const presence = usePresence();
  const { byId } = useObjects();
  const ref = useRef<InstancedMesh>(null);
  const ghosts = useRef(new Map<string, Ghost>());
  const dummy = useMemo(() => new Object3D(), []);

  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, MAX_GHOSTS);
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_GHOSTS * 3).fill(1), 3);
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, []);
  useEffect(() => () => { mesh.dispose(); }, [mesh]);

  // Refresh targets whenever presence rows change; keep eased positions across updates.
  useEffect(() => {
    const seen = new Set<string>();
    for (const p of presence) {
      const obj = byId.get(p.targetObjectId);
      if (!obj) continue;
      seen.add(p.identity);
      const look = worldPosition(obj, new Vector3());
      const target = look.clone().add(new Vector3(0, visualRadius(obj) + 0.12, 0));
      const g = ghosts.current.get(p.identity);
      if (g) {
        g.target.copy(target);
        g.look.copy(look);
        g.color.set(CREWS[p.crew]?.color ?? '#ffffff');
      } else {
        ghosts.current.set(p.identity, {
          pos: target.clone().add(new Vector3(0, 3, 0)), target, look,
          color: new Color(CREWS[p.crew]?.color ?? '#ffffff'),
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    for (const id of [...ghosts.current.keys()]) if (!seen.has(id)) ghosts.current.delete(id);
  }, [presence, byId]);

  useFrame(({ camera, clock }, dt) => {
    const m = ref.current;
    if (!m) return;
    let i = 0;
    const k = 1 - Math.exp(-dt * 3);
    for (const g of ghosts.current.values()) {
      if (i >= MAX_GHOSTS) break;
      g.pos.lerp(g.target, k);
      const bob = Math.sin(clock.elapsedTime * 2 + g.phase) * 0.03;
      dummy.position.copy(g.pos);
      dummy.position.y += bob;
      dummy.lookAt(g.look);
      const dist = camera.position.distanceTo(g.pos);
      dummy.scale.setScalar(Math.max(0.04, dist * 0.012));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.instanceColor!.setXYZ(i, g.color.r, g.color.g, g.color.b);
      i++;
    }
    m.count = i;
    if (i > 0) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
  });

  return <primitive ref={ref} object={mesh} />;
}
