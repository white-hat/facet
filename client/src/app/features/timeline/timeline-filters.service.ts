import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimelineFiltersService {
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly sortDirection = signal<'older' | 'newer'>('older');
  readonly photosPerGroup = signal(30);
  readonly sortBy = signal<'aggregate' | 'date_taken' | 'filename'>('aggregate');
  readonly granularity = signal<'day' | 'week' | 'month'>('day');
}
