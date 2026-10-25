// CSS-rendered planet disc by class. No textures, no WebGL, cheap on phones.
import type { CSSProperties } from 'react';
import type { PlanetClass } from '../types';

interface Look { surface: string; glow: string; bands?: string; ring?: boolean }

const LOOKS: Record<PlanetClass, Look> = {
  rocky: { surface: 'radial-gradient(circle at 40% 40%, #8c7a66, #4f4337 70%, #2b241d)', glow: 'rgba(170,140,110,0.35)',
    bands: 'radial-gradient(circle at 60% 60%, rgba(0,0,0,0.25) 0 12%, transparent 13%), radial-gradient(circle at 30% 70%, rgba(0,0,0,0.2) 0 8%, transparent 9%)' },
  iron: { surface: 'radial-gradient(circle at 40% 40%, #b8b0a8, #6a625c 65%, #2f2a27)', glow: 'rgba(190,180,170,0.35)',
    bands: 'radial-gradient(circle at 65% 35%, rgba(0,0,0,0.3) 0 10%, transparent 11%), radial-gradient(circle at 35% 65%, rgba(0,0,0,0.25) 0 14%, transparent 15%)' },
  water: { surface: 'radial-gradient(circle at 40% 40%, #7fd3ff, #1e6fd9 60%, #0a2a66)', glow: 'rgba(60,160,255,0.5)',
    bands: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.35) 0 18%, transparent 30%), radial-gradient(ellipse at 40% 75%, rgba(255,255,255,0.2) 0 10%, transparent 22%)' },
  sub_neptune: { surface: 'radial-gradient(circle at 40% 40%, #9fd0ff, #4b7fd6 60%, #1b2f6e)', glow: 'rgba(100,150,255,0.45)',
    bands: 'repeating-linear-gradient(170deg, rgba(255,255,255,0.12) 0 8px, transparent 8px 20px)' },
  ice_giant: { surface: 'radial-gradient(circle at 40% 40%, #bdf4ff, #3fb8d9 60%, #124a66)', glow: 'rgba(90,220,255,0.5)',
    bands: 'repeating-linear-gradient(175deg, rgba(255,255,255,0.14) 0 6px, transparent 6px 18px)' },
  gas_giant: { surface: 'radial-gradient(circle at 40% 40%, #ffe0b0, #d9995a 55%, #6b3f1f)', glow: 'rgba(255,190,110,0.45)',
    bands: 'repeating-linear-gradient(176deg, rgba(120,60,20,0.35) 0 5px, transparent 5px 11px, rgba(255,255,255,0.14) 11px 14px, transparent 14px 24px)', ring: true },
  hot_jupiter: { surface: 'radial-gradient(circle at 40% 40%, #ffd199, #ff7a3d 55%, #7a1d0a)', glow: 'rgba(255,110,50,0.6)',
    bands: 'repeating-linear-gradient(178deg, rgba(255,80,20,0.35) 0 6px, transparent 6px 14px)' },
  lava: { surface: 'radial-gradient(circle at 40% 40%, #ffb36b, #e8431f 55%, #3a0a05)', glow: 'rgba(255,90,40,0.7)',
    bands: 'radial-gradient(circle at 60% 60%, rgba(255,220,120,0.6) 0 4%, transparent 5%), radial-gradient(circle at 30% 55%, rgba(255,200,80,0.5) 0 3%, transparent 4%), radial-gradient(circle at 55% 30%, rgba(255,180,60,0.45) 0 5%, transparent 6%)' },
  carbon: { surface: 'radial-gradient(circle at 40% 40%, #e8f0ff, #7f8fb8 55%, #1a1f33)', glow: 'rgba(200,220,255,0.6)',
    bands: 'conic-gradient(from 30deg, rgba(255,255,255,0.3), transparent 25%, rgba(255,255,255,0.25) 50%, transparent 75%, rgba(255,255,255,0.3))' },
  star: { surface: 'radial-gradient(circle at 45% 45%, #fffbe6, #ffd54a 50%, #ff8c1a 85%)', glow: 'rgba(255,213,74,0.8)',
    bands: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.2), transparent 70%)' },
  moon: { surface: 'radial-gradient(circle at 40% 40%, #d6d6d6, #8a8a8a 65%, #3a3a3a)', glow: 'rgba(220,220,220,0.3)',
    bands: 'radial-gradient(circle at 60% 40%, rgba(0,0,0,0.3) 0 9%, transparent 10%), radial-gradient(circle at 35% 65%, rgba(0,0,0,0.25) 0 6%, transparent 7%), radial-gradient(circle at 70% 70%, rgba(0,0,0,0.2) 0 5%, transparent 6%)' },
};

const SPARKS = [[22, 30], [70, 24], [58, 68], [30, 72], [78, 52]];

export function Planet({ cls, size = 96 }: { cls: PlanetClass; size?: number }) {
  const look = LOOKS[cls] ?? LOOKS.rocky;
  const style = {
    '--size': `${size}px`,
    '--p-surface': look.surface,
    '--p-glow': look.glow,
    '--p-bands': look.bands ?? 'none',
  } as CSSProperties;
  const mods = [cls === 'water' && 'px-planet--water', (cls === 'lava' || cls === 'hot_jupiter') && 'px-planet--lava',
    cls === 'carbon' && 'px-planet--carbon', cls === 'ice_giant' && 'px-planet--ice', cls === 'gas_giant' && 'px-planet--gas',
    look.ring && 'px-planet--ring'].filter(Boolean).join(' ');
  return (
    <div className={`px-planet ${mods}`} style={style} aria-hidden>
      {look.ring && <i className="px-planet__ring" />}
      {cls === 'carbon' && SPARKS.map(([l, t], i) => (
        <i key={i} className="px-planet__spark" style={{ left: `${l}%`, top: `${t}%`, animationDelay: `${i * 0.3}s` }} />
      ))}
    </div>
  );
}
