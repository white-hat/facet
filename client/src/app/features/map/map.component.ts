import {
  Component, OnInit, OnDestroy, inject, signal, viewChild, ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import * as L from 'leaflet';

interface MapCluster {
  lat: number;
  lng: number;
  count: number;
  representative_path: string;
}

interface MapPhoto {
  path: string;
  lat: number;
  lng: number;
  aggregate: number;
  filename: string;
}

interface MapResponse {
  clusters?: MapCluster[];
  photos?: MapPhoto[];
}

// Fix Leaflet default marker icon paths (broken when bundled)
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="relative h-full">
      @if (loading()) {
        <div class="absolute inset-0 flex items-center justify-center z-[1000] bg-black/20">
          <mat-spinner diameter="40" />
        </div>
      }
      <div #mapContainer class="h-full w-full"></div>
    </div>
  `,
  // Leaflet requires ::ng-deep styles because its DOM is created outside Angular's
  // view encapsulation. This is a necessary exception to the "no custom CSS" rule.
  styles: [`
    :host ::ng-deep .leaflet-container {
      height: 100%;
      width: 100%;
      font-family: inherit;
    }
    :host ::ng-deep .cluster-count-label {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      color: white;
      font-weight: bold;
      font-size: 12px;
    }
  `],
  host: { class: 'block h-full' },
})
export class MapComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

  /** Escape HTML special characters to prevent XSS in Leaflet popups. */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  protected readonly loading = signal(false);

  private map: L.Map | null = null;
  private markersLayer = L.layerGroup();
  private moveEndHandler: (() => void) | null = null;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;
  private moveEndDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // Defer map init to next tick so the container has dimensions
    this.initTimeout = setTimeout(() => {
      this.initTimeout = null;
      this.initMap();
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.initTimeout !== null) {
      clearTimeout(this.initTimeout);
    }
    if (this.moveEndDebounce !== null) {
      clearTimeout(this.moveEndDebounce);
    }
    if (this.map) {
      if (this.moveEndHandler) {
        this.map.off('moveend', this.moveEndHandler);
      }
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    const container = this.mapContainer().nativeElement;
    this.map = L.map(container).setView([48.8566, 2.3522], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);

    this.moveEndHandler = () => {
      if (this.moveEndDebounce !== null) {
        clearTimeout(this.moveEndDebounce);
      }
      this.moveEndDebounce = setTimeout(() => {
        this.moveEndDebounce = null;
        this.loadMarkers();
      }, 300);
    };
    this.map.on('moveend', this.moveEndHandler);

    // Initial load
    this.loadMarkers();
  }

  private async loadMarkers(): Promise<void> {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    const boundsStr = [
      bounds.getSouthWest().lat,
      bounds.getSouthWest().lng,
      bounds.getNorthEast().lat,
      bounds.getNorthEast().lng,
    ].join(',');

    this.loading.set(true);

    try {
      const data = await firstValueFrom(
        this.api.get<MapResponse>('/photos/map', { bounds: boundsStr, zoom, limit: 500 }),
      );

      this.markersLayer.clearLayers();

      if (data.clusters) {
        for (const cluster of data.clusters) {
          const radius = Math.min(40, Math.max(14, 10 + Math.log2(cluster.count) * 5));
          const marker = L.circleMarker([cluster.lat, cluster.lng], {
            radius,
            fillColor: '#3b82f6',
            color: '#1d4ed8',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.7,
          });

          // Count label via tooltip
          marker.bindTooltip(String(cluster.count), {
            permanent: true,
            direction: 'center',
            className: 'cluster-count-label',
          });

          if (cluster.representative_path) {
            const thumbUrl = this.escapeHtml(this.api.thumbnailUrl(cluster.representative_path, 160));
            const countLabel = this.escapeHtml(this.i18n.t('map.cluster_photos', { count: cluster.count }));
            marker.bindPopup(
              `<div style="text-align:center">` +
              `<img src="${thumbUrl}" style="max-width:150px;border-radius:6px;display:block;margin:0 auto" />` +
              `<div style="margin-top:4px;font-size:13px;font-weight:500">${countLabel}</div>` +
              `</div>`,
              { maxWidth: 200, minWidth: 160 },
            );
          }

          marker.addTo(this.markersLayer);
        }
      }

      if (data.photos) {
        for (const photo of data.photos) {
          const marker = L.marker([photo.lat, photo.lng]);

          const thumbUrl = this.escapeHtml(this.api.thumbnailUrl(photo.path, 160));
          const score = photo.aggregate != null ? photo.aggregate.toFixed(1) : '--';
          const scoreLabel = this.escapeHtml(this.i18n.t('map.score', { score }));
          marker.bindPopup(
            `<div style="text-align:center;cursor:pointer" data-photo-path="${this.escapeHtml(photo.path)}">` +
            `<img src="${thumbUrl}" style="max-width:150px;border-radius:6px;display:block;margin:0 auto" />` +
            `<div style="margin-top:4px;font-size:13px">${this.escapeHtml(photo.filename)}</div>` +
            `<div style="font-size:11px;opacity:0.7">${scoreLabel}</div>` +
            `</div>`,
            { maxWidth: 200, minWidth: 160 },
          );

          marker.on('popupopen', () => {
            const popup = marker.getPopup();
            const el = popup?.getElement()?.querySelector('[data-photo-path]') as HTMLElement | null;
            el?.addEventListener('click', () => {
              this.router.navigate(['/photo'], { queryParams: { path: photo.path } });
            });
          });

          marker.addTo(this.markersLayer);
        }
      }
    } catch (err) {
      console.error('Failed to load map data', err);
    } finally {
      this.loading.set(false);
    }
  }
}
