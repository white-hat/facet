import { GalleryFilters } from '../../features/gallery/gallery.store';

export interface AdditionalFilterDef {
  id: string;
  labelKey: string;
  sectionKey: string;
  minKey: keyof GalleryFilters;
  maxKey: keyof GalleryFilters;
  sliderMin: number;
  sliderMax: number;
  step: number;
  displaySuffix?: string;
  displayPrefix?: string;
  spanWidth: string;
}
