import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { ElementRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TimelineFiltersService } from './timeline-filters.service';
import { TimelineComponent } from './timeline.component';
import { TimelineDatePipe } from './timeline-date.pipe';

describe('TimelineComponent', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;
  let mockApi: { get: jest.Mock };
  let mockRouter: { navigate: jest.Mock };
  let mockFilters: {
    dateFrom: ReturnType<typeof signal<string>>;
    dateTo: ReturnType<typeof signal<string>>;
    sortDirection: ReturnType<typeof signal<'older' | 'newer'>>;
    photosPerGroup: ReturnType<typeof signal<number>>;
    sortBy: ReturnType<typeof signal<'aggregate' | 'date_taken' | 'filename'>>;
    granularity: ReturnType<typeof signal<'day' | 'week' | 'month'>>;
  };

  const timelineResponse = {
    groups: [
      {
        date: '2024-06-15',
        count: 5,
        photos: [
          { path: '/photo1.jpg', filename: 'photo1.jpg', aggregate: 8.5 },
          { path: '/photo2.jpg', filename: 'photo2.jpg', aggregate: 7.0 },
        ],
      },
      {
        date: '2024-06-14',
        count: 3,
        photos: [
          { path: '/photo3.jpg', filename: 'photo3.jpg', aggregate: 6.5 },
        ],
      },
    ],
    next_cursor: 'cursor_abc',
    has_more: true,
  };

  beforeEach(() => {
    mockApi = {
      get: jest.fn(() => of(timelineResponse)),
    };
    mockRouter = { navigate: jest.fn() };
    mockFilters = {
      dateFrom: signal(''),
      dateTo: signal(''),
      sortDirection: signal<'older' | 'newer'>('older'),
      photosPerGroup: signal(30),
      sortBy: signal<'aggregate' | 'date_taken' | 'filename'>('aggregate'),
      granularity: signal<'day' | 'week' | 'month'>('day'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: mockApi },
        { provide: Router, useValue: mockRouter },
        { provide: ElementRef, useValue: { nativeElement: document.createElement('div') } },
        { provide: TimelineFiltersService, useValue: mockFilters },
      ],
    });
    component = TestBed.runInInjectionContext(() => new TimelineComponent());
  });

  describe('loadInitial', () => {
    it('should fetch timeline data and populate groups', async () => {
      await component.loadInitial();

      expect(mockApi.get).toHaveBeenCalledWith('/timeline', {
        limit: 30,
        direction: 'older',
        photos_per_group: 30,
        sort_by: 'aggregate',
        granularity: 'day',
      });
      expect(component.groups()).toHaveLength(2);
      expect(component.groups()[0].date).toBe('2024-06-15');
      expect(component.hasMore()).toBe(true);
      expect(component.nextCursor()).toBe('cursor_abc');
    });

    it('should set loading true then false', async () => {
      expect(component.loading()).toBe(false);

      const promise = component.loadInitial();
      expect(component.loading()).toBe(true);

      await promise;
      expect(component.loading()).toBe(false);
    });

    it('should include date filters when set', async () => {
      mockFilters.dateFrom.set('2024-01-01');
      mockFilters.dateTo.set('2024-06-30');

      await component.loadInitial();

      expect(mockApi.get).toHaveBeenCalledWith('/timeline', {
        limit: 30,
        direction: 'older',
        photos_per_group: 30,
        sort_by: 'aggregate',
        granularity: 'day',
        date_from: '2024-01-01',
        date_to: '2024-06-30',
      });
    });

    it('should set loading false even on error', async () => {
      mockApi.get.mockReturnValue(throwError(() => new Error('fail')));

      try {
        await component.loadInitial();
      } catch {
        // expected
      }
      expect(component.loading()).toBe(false);
    });
  });

  describe('loadMore', () => {
    beforeEach(async () => {
      await component.loadInitial();
      mockApi.get.mockClear();
    });

    it('should append new groups to existing ones', async () => {
      mockApi.get.mockReturnValue(of({
        groups: [{ date: '2024-06-13', count: 2, photos: [] }],
        next_cursor: null,
        has_more: false,
      }));

      await component.loadMore();

      expect(component.groups()).toHaveLength(3);
      expect(component.groups()[2].date).toBe('2024-06-13');
      expect(component.hasMore()).toBe(false);
    });

    it('should pass cursor to API', async () => {
      mockApi.get.mockReturnValue(of({ groups: [], next_cursor: null, has_more: false }));

      await component.loadMore();

      expect(mockApi.get).toHaveBeenCalledWith('/timeline', expect.objectContaining({
        cursor: 'cursor_abc',
      }));
    });

    it('should do nothing when no cursor', async () => {
      component.nextCursor.set(null);
      mockApi.get.mockReturnValue(of({ groups: [], next_cursor: null, has_more: false }));

      await component.loadMore();

      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should do nothing when already loading', async () => {
      component.loadingMore.set(true);
      mockApi.get.mockReturnValue(of({ groups: [], next_cursor: null, has_more: false }));

      await component.loadMore();

      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should set loadingMore true then false', async () => {
      mockApi.get.mockReturnValue(of({ groups: [], next_cursor: null, has_more: false }));

      const promise = component.loadMore();
      expect(component.loadingMore()).toBe(true);

      await promise;
      expect(component.loadingMore()).toBe(false);
    });
  });

  describe('navigateToDate', () => {
    it('should navigate to gallery with date filter params', () => {
      component.navigateToDate('2024-06-15');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: {
          date_from: '2024-06-15',
          date_to: '2024-06-15',
          sort: 'date_taken',
          sort_direction: 'DESC',
        },
      });
    });
  });

  describe('openPhoto', () => {
    it('should navigate to gallery filtered by photo date', () => {
      const photo = { path: '/photo.jpg', filename: 'photo.jpg', aggregate: 8 };
      component.openPhoto(photo, '2024-06-15');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: {
          date_from: '2024-06-15',
          date_to: '2024-06-15',
          sort: 'aggregate',
          sort_direction: 'DESC',
        },
      });
    });
  });

  describe('TimelineDatePipe', () => {
    const pipe = new TimelineDatePipe();

    it('should format day dates as full date', () => {
      const result = pipe.transform('2024-06-15');
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should format week dates as "Week N, YYYY"', () => {
      expect(pipe.transform('2025-W46')).toBe('Week 46, 2025');
    });

    it('should format month dates as "MMMM yyyy"', () => {
      const result = pipe.transform('2025-11');
      expect(result).toContain('November');
      expect(result).toContain('2025');
    });

    it('should return empty string for empty input', () => {
      expect(pipe.transform('')).toBe('');
    });
  });
});
