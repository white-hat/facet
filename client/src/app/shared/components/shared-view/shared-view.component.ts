import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { I18nService } from '../../../core/services/i18n.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ThumbnailUrlPipe, PersonThumbnailUrlPipe } from '../../pipes/thumbnail-url.pipe';

type EntityType = 'album' | 'person';

interface SharedPhoto {
  path: string;
  filename: string;
  aggregate: number;
  aesthetic?: number;
  date_taken?: string;
}

interface SharedAlbumResponse {
  album: { id: number; name: string; description: string; is_smart?: boolean; smart_filter_json?: string };
  photos: SharedPhoto[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_more: boolean;
}

interface SharedPersonResponse {
  person: { id: number; name: string; face_count: number };
  photos: SharedPhoto[];
  total: number;
  page: number;
  has_more: boolean;
}

@Component({
  selector: 'app-shared-view',
  standalone: true,
  host: { class: 'block h-full' },
  imports: [
    MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    MatSelectModule, MatFormFieldModule,
    TranslatePipe, ThumbnailUrlPipe, PersonThumbnailUrlPipe,
  ],
  template: `
    @if (loading()) {
      <div class="flex items-center justify-center h-64">
        <mat-spinner diameter="40" />
      </div>
    } @else if (error()) {
      <div class="flex flex-col items-center justify-center h-64 opacity-60">
        <mat-icon class="!text-5xl !w-12 !h-12 mb-4">lock</mat-icon>
        <p>{{ error() }}</p>
      </div>
    } @else {
      <div class="bg-[var(--mat-sys-surface)] border-b border-[var(--mat-sys-outline-variant)] px-4 py-3">
        @if (entityType === 'person') {
          <div class="flex items-center gap-3">
            @if (entityId) {
              <img
                [src]="entityId | personThumbnailUrl"
                class="w-12 h-12 rounded-full object-cover"
                alt=""
              />
            }
            <div>
              <h1 class="text-xl font-semibold">{{ entityName() }}</h1>
              <p class="text-xs opacity-50">{{ 'ui.labels.photo_count' | translate:{ count: total() } }}</p>
            </div>
          </div>
        } @else {
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-xl font-semibold">{{ entityName() }}</h1>
              @if (description()) {
                <p class="text-sm opacity-70 mt-1">{{ description() }}</p>
              }
              <p class="text-xs opacity-50 mt-1">{{ 'albums.photos_count' | translate:{ count: total() } }}</p>
            </div>
            @if (isSmart()) {
              <div class="flex items-center gap-2">
                <mat-form-field class="w-36" subscriptSizing="dynamic">
                  <mat-label>{{ 'gallery.sort' | translate }}</mat-label>
                  <mat-select [value]="sortBy()" (selectionChange)="sortBy.set($event.value)">
                    <mat-option value="aggregate">{{ 'gallery.sort_aggregate' | translate }}</mat-option>
                    <mat-option value="aesthetic">{{ 'gallery.sort_aesthetic' | translate }}</mat-option>
                    <mat-option value="date_taken">{{ 'gallery.sort_date' | translate }}</mat-option>
                  </mat-select>
                </mat-form-field>
                <button mat-icon-button (click)="toggleSortDirection()">
                  <mat-icon>{{ sortDirection() === 'desc' ? 'arrow_downward' : 'arrow_upward' }}</mat-icon>
                </button>
              </div>
            }
          </div>
        }
      </div>

      <div class="p-4">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          @for (photo of sortedPhotos(); track photo.path) {
            <div class="relative rounded-lg overflow-hidden bg-[var(--mat-sys-surface-container)]">
              <img [src]="photo.path | thumbnailUrl:320"
                   [alt]="photo.filename"
                   class="w-full aspect-square object-cover" />
            </div>
          }
        </div>

        @if (hasMore()) {
          <div class="flex justify-center mt-6">
            <button mat-flat-button (click)="loadMore()" [disabled]="loadingMore()">
              @if (loadingMore()) {
                <mat-spinner diameter="20" class="inline-flex !w-5 !h-5" />
              } @else {
                {{ 'ui.buttons.load_more' | translate }}
              }
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class SharedViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal('');
  protected readonly entityName = signal('');
  protected readonly description = signal('');
  protected readonly photos = signal<SharedPhoto[]>([]);
  protected readonly total = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly isSmart = signal(false);
  protected readonly sortBy = signal('aggregate');
  protected readonly sortDirection = signal<'asc' | 'desc'>('desc');

  protected readonly sortedPhotos = computed(() => {
    const photos = [...this.photos()];
    const sort = this.sortBy();
    const dir = this.sortDirection() === 'desc' ? -1 : 1;
    return photos.sort((a, b) => {
      if (sort === 'date_taken') {
        return ((a.date_taken ?? '') > (b.date_taken ?? '') ? 1 : -1) * dir;
      }
      const va = sort === 'aesthetic' ? (a.aesthetic ?? 0) : (a.aggregate ?? 0);
      const vb = sort === 'aesthetic' ? (b.aesthetic ?? 0) : (b.aggregate ?? 0);
      return (va - vb) * dir;
    });
  });

  protected entityType: EntityType = 'album';
  protected entityId = 0;
  private token = '';
  private currentPage = 1;

  async ngOnInit(): Promise<void> {
    this.entityType = this.route.snapshot.url[1]?.path === 'person' ? 'person' : 'album';

    const paramKey = this.entityType === 'album' ? 'albumId' : 'personId';
    this.entityId = Number(this.route.snapshot.paramMap.get(paramKey));
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.entityId || !this.token) {
      const i18nPrefix = this.entityType === 'album' ? 'albums' : 'persons';
      this.error.set(this.i18n.t(`${i18nPrefix}.invalid_share_link`));
      this.loading.set(false);
      return;
    }

    await this.loadPage(1);
  }

  protected async loadMore(): Promise<void> {
    this.loadingMore.set(true);
    try {
      await this.loadPage(this.currentPage + 1, true);
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async loadPage(page: number, append = false): Promise<void> {
    try {
      if (this.entityType === 'album') {
        await this.loadAlbumPage(page, append);
      } else {
        await this.loadPersonPage(page, append);
      }
    } catch (e: unknown) {
      const i18nPrefix = this.entityType === 'album' ? 'albums' : 'persons';
      if (e instanceof HttpErrorResponse && (e.status === 403 || e.status === 401)) {
        const errorKey = this.entityType === 'album'
          ? 'albums.share_link_revoked'
          : 'persons.share_link_error';
        this.error.set(this.i18n.t(errorKey));
      } else {
        this.error.set(this.i18n.t(`${i18nPrefix}.load_error`));
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleSortDirection(): void {
    this.sortDirection.update(d => d === 'desc' ? 'asc' : 'desc');
  }

  private async loadAlbumPage(page: number, append: boolean): Promise<void> {
    const res = await firstValueFrom(
      this.api.get<SharedAlbumResponse>(
        `/shared/album/${this.entityId}`,
        { token: this.token, page },
      ),
    );
    this.entityName.set(res.album.name);
    this.description.set(res.album.description);
    this.isSmart.set(res.album.is_smart ?? false);
    this.total.set(res.total);
    this.hasMore.set(res.has_more);
    this.currentPage = res.page;
    this.applyPhotos(res.photos, append);
  }

  private async loadPersonPage(page: number, append: boolean): Promise<void> {
    const res = await firstValueFrom(
      this.api.get<SharedPersonResponse>(
        `/persons/${this.entityId}/photos`,
        { token: this.token, page, per_page: 48 },
      ),
    );
    this.entityName.set(res.person.name);
    this.total.set(res.total);
    this.hasMore.set(res.has_more);
    this.currentPage = res.page;
    this.applyPhotos(res.photos, append);
  }

  private applyPhotos(photos: SharedPhoto[], append: boolean): void {
    if (append) {
      this.photos.update(prev => [...prev, ...photos]);
    } else {
      this.photos.set(photos);
    }
  }
}
