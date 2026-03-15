import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { AutoAlbumSettingsDialogComponent } from './auto-album-settings-dialog.component';

describe('AutoAlbumSettingsDialogComponent', () => {
  let component: AutoAlbumSettingsDialogComponent;
  let mockDialogRef: { close: jest.Mock };

  beforeEach(() => {
    mockDialogRef = { close: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        AutoAlbumSettingsDialogComponent,
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    });
    component = TestBed.inject(AutoAlbumSettingsDialogComponent);
  });

  it('should have default settings', () => {
    expect(component.minPhotos).toBe(5);
    expect(component.timeGap).toBe(4);
    expect(component.embeddingThreshold).toBe(0.6);
  });

  it('should close dialog with settings on confirm', () => {
    component.minPhotos = 10;
    component.timeGap = 8;
    component.embeddingThreshold = 0.8;

    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      min_photos_per_album: 10,
      time_gap_hours: 8,
      embedding_threshold: 0.8,
    });
  });

  it('should close dialog with default settings when unchanged', () => {
    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      min_photos_per_album: 5,
      time_gap_hours: 4,
      embedding_threshold: 0.6,
    });
  });
});
