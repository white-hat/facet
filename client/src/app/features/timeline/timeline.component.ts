import {
  Component,
  inject,
  signal,
  effect,
  OnInit,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe, DatePipe } from '@angular/common';

@Pipe({ name: 'toLocalDate', standalone: true })
export class ToLocalDatePipe implements PipeTransform {
  transform(dateStr: string): Date {
    return new Date(dateStr + 'T12:00:00');
  }
}
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TimelineFiltersService } from './timeline-filters.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ThumbnailUrlPipe } from '../../shared/pipes/thumbnail-url.pipe';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { Photo } from '../../shared/models/photo.model';

interface TimelineGroup {
  date: string;
  count: number;
  photos: Photo[];
}

interface TimelineResponse {
  groups: TimelineGroup[];
  next_cursor: string | null;
  has_more: boolean;
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    ThumbnailUrlPipe,
    InfiniteScrollDirective,
    DecimalPipe,
    DatePipe,
    ToLocalDatePipe,
  ],
  host: { class: 'block h-full overflow-auto' },
  template: `
    @if (loading() && groups().length === 0) {
      <div class="flex items-center justify-center h-full">
        <mat-spinner diameter="48" />
      </div>
    }

    @if (!loading() && groups().length === 0) {
      <div class="flex flex-col items-center justify-center h-full opacity-60">
        <mat-icon class="!text-5xl !w-12 !h-12 mb-4">calendar_today</mat-icon>
        <p>{{ 'timeline.empty' | translate }}</p>
      </div>
    }

    @if (groups().length > 0) {
      <div class="px-4 pt-2 pb-4 max-w-[1800px] mx-auto space-y-3">
        @for (group of groups(); track group.date) {
          <section>
            <!-- Sticky date header -->
            <button
              class="sticky top-0 z-10 flex items-center gap-2 py-2 px-3 mb-2 rounded-lg
                     bg-[var(--mat-sys-surface-container)] hover:bg-[var(--mat-sys-surface-container-high)]
                     transition-colors cursor-pointer w-full text-left"
              (click)="navigateToDate(group.date)">
              <mat-icon class="!text-lg !w-5 !h-5 !leading-5 opacity-70">calendar_today</mat-icon>
              <span class="font-semibold text-sm">
                {{ group.date | toLocalDate | date:'fullDate' }}
              </span>
              <span class="text-xs opacity-60 ml-1">
                ({{ group.count | number }})
              </span>
            </button>

            <!-- Horizontal photo strip -->
            <div class="flex gap-2 overflow-x-auto p-0.5 pb-2 scrollbar-thin">
              @for (photo of group.photos; track photo.path) {
                <div
                  class="group/img relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden
                         outline-2 outline-transparent hover:outline-[var(--mat-sys-primary)] transition-all"
                  (click)="openPhoto(photo, group.date)">
                  <img
                    [src]="photo.path | thumbnailUrl:320"
                    [alt]="photo.filename"
                    class="h-40 w-auto object-cover"
                    loading="lazy" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent
                              opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <div class="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between">
                      <span class="text-white text-xs truncate max-w-[120px]">{{ photo.filename }}</span>
                      @if (photo.aggregate != null) {
                        <span class="text-white text-xs font-medium ml-1">
                          {{ photo.aggregate | number:'1.1-1' }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
              }
              @if (group.count > group.photos.length) {
                <button
                  class="flex-shrink-0 h-40 w-28 flex flex-col items-center justify-center rounded-lg
                         bg-[var(--mat-sys-surface-container-high)] hover:bg-[var(--mat-sys-surface-container-highest)]
                         transition-colors cursor-pointer"
                  (click)="navigateToDate(group.date)">
                  <span class="text-lg font-semibold opacity-70">
                    +{{ group.count - group.photos.length | number }}
                  </span>
                  <span class="text-xs opacity-50 mt-1">{{ 'timeline.more' | translate }}</span>
                </button>
              }
            </div>
          </section>
        }

        <!-- Load more trigger / spinner -->
        @if (hasMore()) {
          <div appInfiniteScroll scrollRoot="app-timeline" (scrollReached)="onScrollReached()" class="flex justify-center py-8">
            @if (loadingMore()) {
              <mat-spinner diameter="32" />
            } @else {
              <button mat-stroked-button (click)="loadMore()">
                {{ 'timeline.load_more' | translate }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class TimelineComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly filters = inject(TimelineFiltersService);

  protected readonly groups = signal<TimelineGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly nextCursor = signal<string | null>(null);

  private initialized = false;
  private loadVersion = 0;

  constructor() {
    effect(() => {
      this.filters.dateFrom();
      this.filters.dateTo();
      this.filters.sortDirection();
      if (this.initialized) {
        this.groups.set([]);
        this.nextCursor.set(null);
        this.loadInitial();
      }
    });
  }

  ngOnInit(): void {
    this.initialized = true;
    this.loadInitial();
  }

  private async loadInitial(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    try {
      const params: Record<string, string | number> = { limit: 30, direction: this.filters.sortDirection() };
      if (this.filters.dateFrom()) params['date_from'] = this.filters.dateFrom();
      if (this.filters.dateTo()) params['date_to'] = this.filters.dateTo();
      const res = await firstValueFrom(
        this.api.get<TimelineResponse>('/timeline', params),
      );
      if (version !== this.loadVersion) return;
      this.groups.set(res.groups);
      this.nextCursor.set(res.next_cursor);
      this.hasMore.set(res.has_more);
    } finally {
      if (version === this.loadVersion) {
        this.loading.set(false);
      }
    }
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;

    this.loadingMore.set(true);
    try {
      const params: Record<string, string | number> = { cursor, limit: 30, direction: this.filters.sortDirection() };
      if (this.filters.dateFrom()) params['date_from'] = this.filters.dateFrom();
      if (this.filters.dateTo()) params['date_to'] = this.filters.dateTo();
      const res = await firstValueFrom(
        this.api.get<TimelineResponse>('/timeline', params),
      );
      this.groups.update(prev => [...prev, ...res.groups]);
      this.nextCursor.set(res.next_cursor);
      this.hasMore.set(res.has_more);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected onScrollReached(): void {
    if (this.hasMore() && !this.loadingMore()) {
      this.loadMore();
    }
  }

  protected navigateToDate(date: string): void {
    this.router.navigate(['/'], {
      queryParams: {
        date_from: date,
        date_to: date,
        sort: 'date_taken',
        sort_direction: 'DESC',
      },
    });
  }

  protected openPhoto(_photo: Photo, date: string): void {
    this.router.navigate(['/'], {
      queryParams: {
        date_from: date,
        date_to: date,
        sort: 'aggregate',
        sort_direction: 'DESC',
      },
    });
  }
}
