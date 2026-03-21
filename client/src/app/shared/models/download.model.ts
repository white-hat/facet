export interface DownloadOption {
  type: 'original' | 'darktable' | 'raw';
  profile?: string;
  label: string;
  extension?: string;
}
