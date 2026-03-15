import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { I18nService } from '../../../core/services/i18n.service';
import { SharedViewComponent } from './shared-view.component';

function buildMockRoute(
  entityType: 'album' | 'person',
  id: string | null,
  token: string | null,
) {
  const paramKey = entityType === 'album' ? 'albumId' : 'personId';
  return {
    snapshot: {
      url: [{ path: 'shared' }, { path: entityType }],
      paramMap: { get: jest.fn((key: string) => key === paramKey ? id : null) },
      queryParamMap: { get: jest.fn((key: string) => key === 'token' ? token : null) },
    },
  };
}

describe('SharedViewComponent', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;
  let mockApi: { get: jest.Mock };
  let mockI18n: { t: jest.Mock };

  const sharedAlbumResponse = {
    album: { id: 1, name: 'Shared Album', description: 'A shared album' },
    photos: [
      { path: '/p1.jpg', filename: 'p1.jpg', aggregate: 8.5 },
      { path: '/p2.jpg', filename: 'p2.jpg', aggregate: 7.0 },
    ],
    total: 10,
    page: 1,
    per_page: 20,
    total_pages: 1,
    has_more: false,
  };

  const sharedPersonResponse = {
    person: { id: 5, name: 'Alice', face_count: 20 },
    photos: [
      { path: '/a1.jpg', filename: 'a1.jpg', aggregate: 9.0 },
    ],
    total: 15,
    page: 1,
    has_more: true,
  };

  function createComponent(
    entityType: 'album' | 'person',
    id: string | null = '1',
    token: string | null = 'valid_token',
  ) {
    const mockRoute = buildMockRoute(entityType, id, token);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SharedViewComponent,
        { provide: ApiService, useValue: mockApi },
        { provide: I18nService, useValue: mockI18n },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    });
    component = TestBed.inject(SharedViewComponent);
  }

  beforeEach(() => {
    mockApi = {
      get: jest.fn(() => of(sharedAlbumResponse)),
    };
    mockI18n = {
      t: jest.fn((key: string) => key),
    };
  });

  describe('album mode', () => {
    describe('ngOnInit', () => {
      it('should load shared album data', async () => {
        createComponent('album', '1', 'abc123');

        await component.ngOnInit();

        expect(mockApi.get).toHaveBeenCalledWith('/shared/album/1', { token: 'abc123', page: 1 });
        expect(component.entityName()).toBe('Shared Album');
        expect(component.description()).toBe('A shared album');
        expect(component.photos()).toHaveLength(2);
        expect(component.total()).toBe(10);
        expect(component.loading()).toBe(false);
      });

      it('should set error when albumId is missing', async () => {
        createComponent('album', null, 'abc123');

        await component.ngOnInit();

        expect(component.error()).toBe('albums.invalid_share_link');
        expect(component.loading()).toBe(false);
        expect(mockApi.get).not.toHaveBeenCalled();
      });

      it('should set error when token is missing', async () => {
        createComponent('album', '1', null);

        await component.ngOnInit();

        expect(component.error()).toBe('albums.invalid_share_link');
        expect(component.loading()).toBe(false);
        expect(mockApi.get).not.toHaveBeenCalled();
      });

      it('should set error when albumId is 0', async () => {
        createComponent('album', '0', 'token');

        await component.ngOnInit();

        expect(component.error()).toBe('albums.invalid_share_link');
        expect(mockApi.get).not.toHaveBeenCalled();
      });

      it('should set revoked error on 403 response', async () => {
        mockApi.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
        createComponent('album', '1', 'expired_token');

        await component.ngOnInit();

        expect(component.error()).toBe('albums.share_link_revoked');
        expect(component.loading()).toBe(false);
      });

      it('should set generic error on other HTTP errors', async () => {
        mockApi.get.mockReturnValue(throwError(() => ({ status: 500 })));
        createComponent('album', '1', 'token');

        await component.ngOnInit();

        expect(component.error()).toBe('albums.load_error');
        expect(component.loading()).toBe(false);
      });
    });

    describe('loadMore', () => {
      beforeEach(async () => {
        createComponent('album', '1', 'token');
        await component.ngOnInit();
        mockApi.get.mockClear();
      });

      it('should load next page and append photos', async () => {
        mockApi.get.mockReturnValue(of({
          album: { id: 1, name: 'Shared Album', description: 'A shared album' },
          photos: [{ path: '/p3.jpg', filename: 'p3.jpg', aggregate: 6.5 }],
          total: 10,
          page: 2,
          per_page: 20,
          total_pages: 2,
          has_more: false,
        }));

        await component.loadMore();

        expect(mockApi.get).toHaveBeenCalledWith('/shared/album/1', { token: 'token', page: 2 });
        expect(component.photos()).toHaveLength(3);
      });

      it('should set loadingMore true then false', async () => {
        mockApi.get.mockReturnValue(of({
          ...sharedAlbumResponse,
          page: 2,
          has_more: false,
        }));

        const promise = component.loadMore();
        expect(component.loadingMore()).toBe(true);

        await promise;
        expect(component.loadingMore()).toBe(false);
      });
    });
  });

  describe('person mode', () => {
    beforeEach(() => {
      mockApi.get.mockReturnValue(of(sharedPersonResponse));
    });

    describe('ngOnInit', () => {
      it('should load shared person data', async () => {
        createComponent('person', '5', 'tok123');

        await component.ngOnInit();

        expect(mockApi.get).toHaveBeenCalledWith('/persons/5/photos', { token: 'tok123', page: 1, per_page: 48 });
        expect(component.entityName()).toBe('Alice');
        expect(component.photos()).toHaveLength(1);
        expect(component.total()).toBe(15);
        expect(component.hasMore()).toBe(true);
        expect(component.loading()).toBe(false);
      });

      it('should set error when personId is missing', async () => {
        createComponent('person', null, 'tok123');

        await component.ngOnInit();

        expect(component.error()).toBe('persons.invalid_share_link');
        expect(component.loading()).toBe(false);
        expect(mockApi.get).not.toHaveBeenCalled();
      });

      it('should set share_link_error on 403 response', async () => {
        mockApi.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
        createComponent('person', '5', 'bad_token');

        await component.ngOnInit();

        expect(component.error()).toBe('persons.share_link_error');
        expect(component.loading()).toBe(false);
      });

      it('should set share_link_error on 401 response', async () => {
        mockApi.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
        createComponent('person', '5', 'bad_token');

        await component.ngOnInit();

        expect(component.error()).toBe('persons.share_link_error');
        expect(component.loading()).toBe(false);
      });

      it('should set generic error on other HTTP errors', async () => {
        mockApi.get.mockReturnValue(throwError(() => ({ status: 500 })));
        createComponent('person', '5', 'token');

        await component.ngOnInit();

        expect(component.error()).toBe('persons.load_error');
        expect(component.loading()).toBe(false);
      });
    });

    describe('loadMore', () => {
      beforeEach(async () => {
        createComponent('person', '5', 'token');
        await component.ngOnInit();
        mockApi.get.mockClear();
      });

      it('should load next page and append photos', async () => {
        mockApi.get.mockReturnValue(of({
          ...sharedPersonResponse,
          photos: [{ path: '/a2.jpg', filename: 'a2.jpg', aggregate: 7.5 }],
          page: 2,
          has_more: false,
        }));

        await component.loadMore();

        expect(mockApi.get).toHaveBeenCalledWith('/persons/5/photos', { token: 'token', page: 2, per_page: 48 });
        expect(component.photos()).toHaveLength(2);
      });
    });
  });
});
