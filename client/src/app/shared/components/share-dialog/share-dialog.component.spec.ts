import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

describe('ShareDialogComponent', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: any;
  let mockHttp: { post: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let mockDialogRef: { close: jest.Mock };

  function createComponent(data: ShareDialogData) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ShareDialogComponent,
        { provide: HttpClient, useValue: mockHttp },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    component = TestBed.inject(ShareDialogComponent);
  }

  beforeEach(() => {
    mockHttp = {
      post: jest.fn(() => of({ share_url: '/shared/album/1?token=abc', share_token: 'abc' })),
      get: jest.fn(() => of({ token: 'xyz' })),
      delete: jest.fn(() => of({})),
    };
    mockDialogRef = { close: jest.fn() };
  });

  describe('album sharing', () => {
    const albumData: ShareDialogData = {
      entityType: 'album',
      entityId: 1,
      autoGenerate: true,
      i18nPrefix: 'albums',
      generateApi: {
        method: 'post',
        url: '/api/albums/1/share',
        body: {},
        extractUrl: (res: Record<string, unknown>) => res['share_url'] as string,
      },
      revokeApi: { url: '/api/albums/1/share' },
    };

    it('should auto-generate link when autoGenerate is true', async () => {
      createComponent(albumData);

      await component.ngOnInit();

      expect(mockHttp.post).toHaveBeenCalledWith('/api/albums/1/share', {});
      expect(component.shareUrl()).toBe('/shared/album/1?token=abc');
    });

    it('should not generate link when autoGenerate is false', async () => {
      createComponent({ ...albumData, autoGenerate: false });

      await component.ngOnInit();

      expect(mockHttp.post).not.toHaveBeenCalled();
      expect(component.shareUrl()).toBe('');
    });

    it('should call POST and set shareUrl on generateLink', async () => {
      createComponent({ ...albumData, entityId: 5, generateApi: { ...albumData.generateApi, url: '/api/albums/5/share' }, autoGenerate: false });

      await component.generateLink();

      expect(mockHttp.post).toHaveBeenCalledWith('/api/albums/5/share', {});
      expect(component.shareUrl()).toBe('/shared/album/1?token=abc');
      expect(component.loading()).toBe(false);
    });

    it('should set loading true then false during generateLink', async () => {
      createComponent({ ...albumData, autoGenerate: false });

      const promise = component.generateLink();
      expect(component.loading()).toBe(true);

      await promise;
      expect(component.loading()).toBe(false);
    });

    it('should call DELETE and close dialog with revoked on revoke', async () => {
      createComponent({ ...albumData, entityId: 3, revokeApi: { url: '/api/albums/3/share' } });
      component.shareUrl.set('/shared/album/3?token=abc');

      await component.revoke();

      expect(mockHttp.delete).toHaveBeenCalledWith('/api/albums/3/share');
      expect(component.shareUrl()).toBe('');
      expect(mockDialogRef.close).toHaveBeenCalledWith('revoked');
    });
  });

  describe('person sharing', () => {
    const personData: ShareDialogData = {
      entityType: 'person',
      entityId: 42,
      autoGenerate: true,
      i18nPrefix: 'persons',
      generateApi: {
        method: 'get',
        url: '/api/auth/person/42/share-token',
        extractUrl: (res: Record<string, unknown>) => `/shared/person/42?token=${res['token']}`,
      },
    };

    it('should auto-generate link via GET for person', async () => {
      createComponent(personData);

      await component.ngOnInit();

      expect(mockHttp.get).toHaveBeenCalledWith('/api/auth/person/42/share-token');
      expect(component.shareUrl()).toBe('/shared/person/42?token=xyz');
    });

    it('should not revoke when revokeApi is absent', async () => {
      createComponent(personData);
      component.shareUrl.set('/shared/person/42?token=xyz');

      await component.revoke();

      expect(mockHttp.delete).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('fullShareUrl', () => {
    it('should prepend window.location.origin to shareUrl', () => {
      createComponent({
        entityType: 'album',
        entityId: 1,
        autoGenerate: false,
        i18nPrefix: 'albums',
        generateApi: { method: 'post', url: '/api/albums/1/share', body: {}, extractUrl: (res: Record<string, unknown>) => res['share_url'] as string },
      });
      component.shareUrl.set('/shared/album/1?token=xyz');

      expect(component.fullShareUrl()).toBe(`${window.location.origin}/shared/album/1?token=xyz`);
    });
  });

  describe('copyLink', () => {
    it('should copy full URL to clipboard', async () => {
      createComponent({
        entityType: 'album',
        entityId: 1,
        autoGenerate: false,
        i18nPrefix: 'albums',
        generateApi: { method: 'post', url: '/api/albums/1/share', body: {}, extractUrl: (res: Record<string, unknown>) => res['share_url'] as string },
      });
      component.shareUrl.set('/shared/album/1?token=abc');

      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await component.copyLink();

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/shared/album/1?token=abc'));
      expect(component.copied()).toBe(true);
    });

    it('should reset copied after timeout', async () => {
      jest.useFakeTimers();
      createComponent({
        entityType: 'album',
        entityId: 1,
        autoGenerate: false,
        i18nPrefix: 'albums',
        generateApi: { method: 'post', url: '/api/albums/1/share', body: {}, extractUrl: (res: Record<string, unknown>) => res['share_url'] as string },
      });
      component.shareUrl.set('/shared/album/1?token=abc');

      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await component.copyLink();
      expect(component.copied()).toBe(true);

      jest.advanceTimersByTime(2000);
      expect(component.copied()).toBe(false);

      jest.useRealTimers();
    });
  });
});
