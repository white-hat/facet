import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { GpsFilterMapDialogComponent } from './gps-filter-map-dialog.component';

// Mock Leaflet
jest.mock('leaflet', () => ({
  Icon: { Default: { mergeOptions: jest.fn() } },
  map: jest.fn(() => ({
    setView: jest.fn().mockReturnThis(),
    on: jest.fn(),
    remove: jest.fn(),
  })),
  tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
  marker: jest.fn(() => ({
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn(),
  })),
  circle: jest.fn(() => ({
    addTo: jest.fn().mockReturnThis(),
    remove: jest.fn(),
    setRadius: jest.fn(),
  })),
}));

// Mock shared leaflet helper
jest.mock('../../shared/leaflet', () => ({
  createLeafletMap: jest.fn(() => ({
    setView: jest.fn().mockReturnThis(),
    on: jest.fn(),
    remove: jest.fn(),
  })),
}));

describe('GpsFilterMapDialogComponent', () => {
  let component: GpsFilterMapDialogComponent;
  let mockDialogRef: { close: jest.Mock };

  function createComponent(data: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    mockDialogRef = { close: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        GpsFilterMapDialogComponent,
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    component = TestBed.inject(GpsFilterMapDialogComponent);
  }

  it('should initialize with default values when no data provided', () => {
    createComponent();

    expect(component.selectedLat()).toBeNull();
    expect(component.selectedLng()).toBeNull();
    expect(component.radiusKm()).toBe(10);
  });

  it('should initialize with provided data', () => {
    createComponent({ lat: 48.8566, lng: 2.3522, radius_km: 25 });

    expect(component.selectedLat()).toBe(48.8566);
    expect(component.selectedLng()).toBe(2.3522);
    expect(component.radiusKm()).toBe(25);
  });

  it('should update radius on onRadiusChange', () => {
    createComponent();

    component.onRadiusChange(50);

    expect(component.radiusKm()).toBe(50);
  });

  it('should close dialog with coordinates on confirm', () => {
    createComponent({ lat: 48.8566, lng: 2.3522, radius_km: 10 });

    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      lat: 48.8566,
      lng: 2.3522,
      radius_km: 10,
    });
  });

  it('should close dialog with null lat when no location selected', () => {
    createComponent();

    component.confirm();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      lat: null,
      lng: null,
      radius_km: 10,
    });
  });
});
