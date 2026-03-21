import { signal, Signal } from '@angular/core';

export function useDesktopSignal(
  options?: { onChange?: (matches: boolean) => void },
): { isDesktop: Signal<boolean>; setup: () => void; cleanup: () => void } {
  const isDesktop = signal(false);
  let mql: MediaQueryList | null = null;
  let handler: ((e: MediaQueryListEvent) => void) | null = null;

  return {
    isDesktop: isDesktop.asReadonly(),
    setup() {
      mql = window.matchMedia('(min-width: 768px)');
      isDesktop.set(mql.matches);
      handler = (e: MediaQueryListEvent) => {
        isDesktop.set(e.matches);
        options?.onChange?.(e.matches);
      };
      mql.addEventListener('change', handler);
    },
    cleanup() {
      if (mql && handler) {
        mql.removeEventListener('change', handler);
      }
    },
  };
}
