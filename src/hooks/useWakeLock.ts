import { useEffect, useRef, useState } from 'react';

/**
 * Empeche l'ecran de s'eteindre pendant une partie.
 *
 * Sur un buzzer, un ecran qui s'assombrit coute une seconde au moment ou elle
 * compte : il faut reveiller le telephone avant de pouvoir appuyer.
 *
 * L'API Screen Wake Lock exige HTTPS et un document visible. Le verrou est
 * libere automatiquement par le navigateur des que l'onglet passe en arriere-
 * plan ou que l'ecran s'eteint malgre tout : il faut donc le redemander a
 * chaque retour au premier plan, sinon il ne tient qu'une fois.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockCapableNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

function getWakeLock() {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as unknown as WakeLockCapableNavigator).wakeLock;
}

export interface WakeLockState {
  /** Le navigateur expose-t-il l'API (HTTPS requis). */
  supported: boolean;
  /** Le verrou est-il effectivement detenu en ce moment. */
  held: boolean;
  /**
   * La premiere tentative a-t-elle abouti, dans un sens ou dans l'autre.
   * Avant cela on ne sait rien : afficher un avertissement ferait clignoter
   * un message d'alerte a chaque chargement, pour rien.
   */
  settled: boolean;
}

export function useWakeLock(active: boolean): WakeLockState {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [held, setHeld] = useState(false);
  const [settled, setSettled] = useState(false);
  const supported = !!getWakeLock();

  useEffect(() => {
    if (!supported) { setSettled(true); return; }
    if (!active) return;

    let cancelled = false;

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      if (sentinel && !sentinel.released) {
        try { await sentinel.release(); } catch { /* deja libere */ }
      }
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await getWakeLock()!.request('screen');
        if (cancelled) { await sentinel.release().catch(() => {}); return; }
        sentinelRef.current = sentinel;
        setHeld(true);
        // Le navigateur relache le verrou de lui-meme (veille systeme, onglet
        // masque) : on en prend note pour pouvoir le reprendre au retour.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          setHeld(false);
        });
      } catch {
        // Refus possible : batterie faible, economiseur d'energie, permission.
        // Sans consequence — la partie reste jouable, l'ecran s'eteindra juste.
        setHeld(false);
      } finally {
        setSettled(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void release();
    };
  }, [supported, active]);

  return { supported, held, settled };
}
