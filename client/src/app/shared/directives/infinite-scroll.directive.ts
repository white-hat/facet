import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input, output } from '@angular/core';

/**
 * Emits `scrollReached` when the host element enters the viewport of the
 * nearest ancestor matching `scrollRoot` (default: `'main'`), or the
 * document viewport when no ancestor matches.
 *
 * Usage:
 *   <div appInfiniteScroll (scrollReached)="loadMore()"></div>
 *   <div appInfiniteScroll scrollRoot="app-timeline" (scrollReached)="loadMore()"></div>
 */
@Directive({ selector: '[appInfiniteScroll]', standalone: true })
export class InfiniteScrollDirective implements OnDestroy {
  /** CSS selector passed to `el.closest()` to find the scroll container. */
  readonly scrollRoot = input<string>('main');

  readonly scrollReached = output<void>();

  private observer: IntersectionObserver | null = null;

  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => this.setup());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Re-observe the sentinel to force a new intersection check. */
  recheck(): void {
    const obs = this.observer;
    if (!obs) return;
    const el = this.el.nativeElement;
    obs.unobserve(el);
    obs.observe(el);
  }

  private setup(): void {
    const el = this.el.nativeElement;
    const root = el.closest(this.scrollRoot()) ?? null;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.scrollReached.emit();
        }
      },
      { root, rootMargin: '200px' },
    );
    this.observer.observe(el);
  }
}
