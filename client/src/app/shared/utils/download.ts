import { Observable, firstValueFrom } from 'rxjs';

async function triggerBlobDownload(
  fetchBlob: () => Observable<Blob>,
  filename: string,
): Promise<void> {
  const blob = await firstValueFrom(fetchBlob());
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export async function downloadAll(
  paths: string[],
  buildUrl: (path: string) => string,
  getRaw: (url: string) => Observable<Blob>,
): Promise<void> {
  for (const path of paths) {
    const filename = path.split(/[\\/]/).pop() ?? '';
    await triggerBlobDownload(() => getRaw(buildUrl(path)), filename);
  }
}
