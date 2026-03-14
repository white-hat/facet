import { Component, inject, signal, computed, Pipe, PipeTransform } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatTabsModule } from '@angular/material/tabs';
import { ApiService } from '../../core/services/api.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ThumbnailUrlPipe } from '../../shared/pipes/thumbnail-url.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { firstValueFrom } from 'rxjs';

@Pipe({ name: 'isKept' })
export class IsKeptPipe implements PipeTransform {
  transform(path: string, selectionsMap: Map<number, Set<string>>, burstId: number): boolean {
    const kept = selectionsMap.get(burstId);
    return kept?.has(path) ?? false;
  }
}

@Pipe({ name: 'isDecided' })
export class IsDecidedPipe implements PipeTransform {
  transform(path: string, selectionsMap: Map<number, Set<string>>, burstId: number): boolean {
    const kept = selectionsMap.get(burstId);
    return kept !== undefined && kept.size > 0 && !kept.has(path);
  }
}

interface BurstPhoto {
  path: string;
  filename: string;
  aggregate: number | null;
  aesthetic: number | null;
  tech_sharpness: number | null;
  is_blink: number;
  is_burst_lead: number;
  date_taken: string | null;
  burst_score: number;
}

interface BurstGroup {
  burst_id: number;
  photos: BurstPhoto[];
  best_path: string;
  count: number;
}

interface BurstGroupsResponse {
  groups: BurstGroup[];
  total_groups: number;
  page: number;
  per_page: number;
  total_pages: number;
}

@Component({
  selector: 'app-burst-culling',
  imports: [
    DecimalPipe,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSliderModule,
    MatTabsModule,
    TranslatePipe,
    ThumbnailUrlPipe,
    IsKeptPipe,
    IsDecidedPipe,
  ],
  template: `
    <div class="flex flex-col h-full px-4 pt-2 pb-2 md:px-8 md:pt-3 md:pb-4 mx-auto w-full max-w-screen-xl">
      <div class="flex items-center gap-2 md:gap-3 shrink-0">
        <mat-tab-group (selectedIndexChange)="onTabChange($event)" class="!-mb-2">
          <mat-tab [label]="'culling.burst_groups' | translate" />
          <mat-tab [label]="'culling.similar_groups' | translate" />
        </mat-tab-group>
        <button mat-icon-button (click)="showHelp.set(!showHelp())" class="!w-8 !h-8 !p-0 ml-auto"
                [matTooltip]="'culling.help' | translate">
          <mat-icon class="!text-lg !w-5 !h-5 !leading-5 opacity-60">help_outline</mat-icon>
        </button>
      </div>

      @if (showHelp()) {
        <p class="text-sm opacity-60 shrink-0 p-3 my-3 rounded-lg bg-[var(--mat-sys-surface-container)]">
          {{ (isSimilarMode() ? 'culling.similar_help' : 'culling.burst_help') | translate }}
        </p>
      }

      <div class="flex flex-col flex-1 min-h-0 pt-3">
      @if (isSimilarMode()) {
        <div class="flex items-center gap-2 shrink-0 mb-3">
          <span class="text-xs opacity-60">{{ 'culling.similarity_threshold' | translate }}</span>
          <mat-slider class="!w-24 !min-w-0" [min]="70" [max]="95" [step]="5" [discrete]="true">
            <input matSliderThumb [value]="similarityThreshold()" (valueChange)="onThresholdChange($event)" />
          </mat-slider>
          <span class="text-xs font-medium w-8">{{ similarityThreshold() }}%</span>
        </div>
      }
      @if (loading()) {
        <div class="flex justify-center items-center py-20">
          <mat-spinner diameter="40" />
        </div>
      } @else if (groups().length === 0) {
        <p class="text-center py-20 opacity-60">{{ 'culling.no_bursts' | translate }}</p>
      } @else {
        <div class="flex items-center justify-between shrink-0 py-3 md:py-4">
          <span class="text-sm opacity-70">{{ 'culling.group_progress' | translate:{ current: currentIndex() + 1, total: totalGroups() } }}</span>
          <div class="flex gap-2">
            <button mat-stroked-button [disabled]="currentIndex() === 0" (click)="prev()">
              <mat-icon>navigate_before</mat-icon>
              {{ 'culling.previous' | translate }}
            </button>
            <button mat-stroked-button [disabled]="currentIndex() >= groups().length - 1 && !hasMore()" (click)="next()">
              {{ 'culling.next' | translate }}
              <mat-icon>navigate_next</mat-icon>
            </button>
          </div>
        </div>

        <div class="flex gap-2 md:gap-3 overflow-x-auto pb-2 items-center mx-auto shrink min-h-0"
             style="max-height: min(70vh, 640px)">
          @for (photo of currentGroup().photos; track photo.path) {
            <div class="relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 h-full max-w-[640px]"
                 [class.border-green-500]="photo.path | isKept:selectionsMap():currentGroup().burst_id"
                 [class.border-red-500]="!(photo.path | isKept:selectionsMap():currentGroup().burst_id) && (photo.path | isDecided:selectionsMap():currentGroup().burst_id)"
                 [class.border-transparent]="!(photo.path | isDecided:selectionsMap():currentGroup().burst_id)"
                 (click)="toggleSelection(photo.path)">
              <img [src]="photo.path | thumbnailUrl:640"
                   class="h-full w-auto object-contain" [alt]="photo.filename" />
              @if (photo.path === currentGroup().best_path) {
                <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-green-600 text-white text-xs font-bold">
                  {{ 'culling.auto_best' | translate }}
                </div>
              }
              @if (photo.path | isKept:selectionsMap():currentGroup().burst_id) {
                <div class="absolute top-2 right-2 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                  <mat-icon class="!text-lg text-white">check</mat-icon>
                </div>
              }
              <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium">
                {{ photo.aggregate | number:'1.1-1' }}
              </div>
              @if (photo.is_blink) {
                <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-yellow-600 text-white text-xs font-bold">
                  {{ 'ui.badges.blink' | translate }}
                </div>
              }
            </div>
          }
        </div>

        <div class="flex gap-2 md:gap-3 mt-4 md:mt-6 shrink-0 justify-center">
          <button mat-flat-button (click)="confirmGroup()" [disabled]="confirming()"
                  [matTooltip]="'culling.confirm_tooltip' | translate">
            <mat-icon>check_circle</mat-icon>
            {{ 'culling.confirm' | translate }}
          </button>
          <button mat-stroked-button (click)="skipGroup()"
                  [matTooltip]="'culling.skip_tooltip' | translate">
            {{ 'culling.skip' | translate }}
          </button>
          <button mat-stroked-button (click)="autoSelectAll()" [disabled]="confirming()"
                  [matTooltip]="'culling.auto_select_all_tooltip' | translate">
            <mat-icon>auto_fix_high</mat-icon>
            {{ 'culling.auto_select_all' | translate }}
          </button>
        </div>
      }
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
})
export class BurstCullingComponent {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  protected readonly showHelp = signal(false);
  protected readonly isSimilarMode = signal(false);
  protected readonly similarityThreshold = signal(85);
  protected readonly groups = signal<BurstGroup[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly totalGroups = signal(0);
  protected readonly loading = signal(true);
  protected readonly confirming = signal(false);

  /** burst_id -> set of kept paths */
  protected readonly selectionsMap = signal<Map<number, Set<string>>>(new Map());

  protected readonly currentGroup = computed(() => this.groups()[this.currentIndex()]);

  private readonly currentPage = signal(1);
  private readonly totalPages = signal(1);
  private readonly similarSeed = Math.floor(Math.random() * 1_000_000);

  protected readonly hasMore = computed(() => {
    return this.currentIndex() < this.groups().length - 1 || this.currentPage() < this.totalPages();
  });

  constructor() {
    void this.loadGroups();
  }

  protected onTabChange(index: number): void {
    this.isSimilarMode.set(index === 1);
    this.currentPage.set(1);
    void this.loadGroups();
  }

  protected onThresholdChange(value: number): void {
    this.similarityThreshold.set(value);
    this.currentPage.set(1);
    void this.loadGroups();
  }

  private async loadGroups(): Promise<void> {
    this.loading.set(true);
    try {
      const endpoint = this.isSimilarMode() ? '/similar-groups' : '/burst-groups';
      const params: Record<string, number> = {
        page: this.currentPage(),
        per_page: 20,
      };
      if (this.isSimilarMode()) {
        (params as Record<string, number | string>)['threshold'] = (this.similarityThreshold() / 100).toString();
        params['seed'] = this.similarSeed;
      }
      const data = await firstValueFrom(
        this.api.get<BurstGroupsResponse>(endpoint, params),
      );
      this.groups.set(data.groups);
      this.totalGroups.set(data.total_groups);
      this.totalPages.set(data.total_pages);
      this.currentIndex.set(0);

      // Auto-select best photo in each group
      const newSelections = new Map<number, Set<string>>();
      for (const group of data.groups) {
        if (group.best_path) {
          newSelections.set(group.burst_id, new Set([group.best_path]));
        }
      }
      this.selectionsMap.set(newSelections);
    } catch {
      this.snackBar.open(this.i18n.t('culling.error_loading'), '', { duration: 2000, horizontalPosition: 'right', verticalPosition: 'bottom' });
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleSelection(path: string): void {
    const group = this.currentGroup();
    if (!group) return;
    const map = new Map(this.selectionsMap());
    const kept = new Set(map.get(group.burst_id) ?? []);

    if (kept.has(path)) {
      kept.delete(path);
    } else {
      kept.add(path);
    }
    map.set(group.burst_id, kept);
    this.selectionsMap.set(map);
  }

  protected async confirmGroup(): Promise<void> {
    const group = this.currentGroup();
    if (!group) return;

    const kept = this.selectionsMap().get(group.burst_id);
    if (!kept || kept.size === 0) return;

    this.confirming.set(true);
    const endpoint = this.isSimilarMode() ? '/similar-groups/select' : '/burst-groups/select';
    try {
      const body: Record<string, unknown> = this.isSimilarMode()
        ? { paths: group.photos.map(p => p.path), keep_paths: [...kept] }
        : { burst_id: group.burst_id, keep_paths: [...kept] };
      await firstValueFrom(this.api.post(endpoint, body));
      this.snackBar.open(this.i18n.t('culling.confirmed'), '', { duration: 2000, horizontalPosition: 'right', verticalPosition: 'bottom' });
      this.moveToNext();
    } catch {
      this.snackBar.open(this.i18n.t('culling.error_confirming'), '', { duration: 2000, horizontalPosition: 'right', verticalPosition: 'bottom' });
    } finally {
      this.confirming.set(false);
    }
  }

  protected skipGroup(): void {
    this.moveToNext();
  }

  protected async autoSelectAll(): Promise<void> {
    this.confirming.set(true);
    try {
      const groups = this.groups();
      const selectEndpoint = this.isSimilarMode() ? '/similar-groups/select' : '/burst-groups/select';
      const isSimilar = this.isSimilarMode();
      const requests = groups.slice(this.currentIndex())
        .filter(g => g.best_path)
        .map(g => {
          const body: Record<string, unknown> = isSimilar
            ? { paths: g.photos.map(p => p.path), keep_paths: [g.best_path] }
            : { burst_id: g.burst_id, keep_paths: [g.best_path] };
          return firstValueFrom(this.api.post(selectEndpoint, body));
        });
      await Promise.all(requests);
      this.snackBar.open(this.i18n.t('culling.confirmed'), '', { duration: 2000, horizontalPosition: 'right', verticalPosition: 'bottom' });
      // Move to last group
      this.currentIndex.set(groups.length - 1);
    } catch {
      this.snackBar.open(this.i18n.t('culling.error_auto_select'), '', { duration: 2000, horizontalPosition: 'right', verticalPosition: 'bottom' });
    } finally {
      this.confirming.set(false);
    }
  }

  protected prev(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
    }
  }

  protected next(): void {
    this.moveToNext();
  }

  private moveToNext(): void {
    if (this.currentIndex() < this.groups().length - 1) {
      this.currentIndex.update(i => i + 1);
    } else if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      void this.loadGroups();
    }
  }
}
