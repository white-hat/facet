import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

export interface AutoAlbumSettings {
  min_photos_per_album: number;
  time_gap_hours: number;
  embedding_threshold: number;
}

@Component({
  selector: 'app-auto-album-settings-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSliderModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'auto_albums.settings_title' | translate }}</h2>
    <mat-dialog-content>
      <div class="flex flex-col gap-2 py-2">
        <mat-form-field class="w-full" subscriptSizing="dynamic">
          <mat-label>{{ 'auto_albums.min_photos' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="minPhotos" min="2" max="100" />
        </mat-form-field>
        <mat-form-field class="w-full" subscriptSizing="dynamic">
          <mat-label>{{ 'auto_albums.time_gap' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="timeGap" min="0.5" max="72" step="0.5" />
        </mat-form-field>
        <div class="pt-1">
          <label class="text-sm opacity-70">{{ 'auto_albums.embedding_threshold' | translate }}: {{ embeddingThreshold }}</label>
          <mat-slider class="w-full" [min]="0.3" [max]="0.95" [step]="0.05">
            <input matSliderThumb [(ngModel)]="embeddingThreshold" />
          </mat-slider>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'ui.buttons.cancel' | translate }}</button>
      <button mat-flat-button (click)="confirm()">{{ 'ui.buttons.apply' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class AutoAlbumSettingsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AutoAlbumSettingsDialogComponent>);

  minPhotos = 5;
  timeGap = 4;
  embeddingThreshold = 0.6;

  confirm(): void {
    this.dialogRef.close({
      min_photos_per_album: this.minPhotos,
      time_gap_hours: this.timeGap,
      embedding_threshold: this.embeddingThreshold,
    } satisfies AutoAlbumSettings);
  }
}
