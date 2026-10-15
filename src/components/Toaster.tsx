import { useEffect, useState } from 'react';

/** Affiche les messages envoyés par toast() (voir lib/fun.ts). */
export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      setMsg({ text: (e as CustomEvent<string>).detail, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    addEventListener('app-toast', onToast);
    return () => {
      removeEventListener('app-toast', onToast);
      clearTimeout(timer);
    };
  }, []);
  return msg ? (
    <div key={msg.id} className="toast" role="status">
      {msg.text}
    </div>
  ) : null;
}
