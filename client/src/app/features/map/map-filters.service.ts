import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MapFiltersService {
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
}
