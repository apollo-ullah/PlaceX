// Tiny toast stack. useToast()(message, kind) from anywhere under <ToastProvider>.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'info' | 'err' | 'ok' | 'gold';
interface Toast { id: number; msg: string; kind: Kind }
type Push = (msg: string, kind?: Kind, ms?: number) => void;

const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback<Push>((msg, kind = 'info', ms = 2600) => {
    const id = ++seq.current;
    setItems(prev => [...prev.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), ms);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="px-toasts" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`px-toast px-toast--${t.kind}`} onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
