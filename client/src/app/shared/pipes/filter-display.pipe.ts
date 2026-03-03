import { Pipe, PipeTransform } from '@angular/core';
import { GalleryFilters } from '../../features/gallery/gallery.store';
import { AdditionalFilterDef } from '../models/filter-def.model';

@Pipe({ name: 'filterDisplay', standalone: true, pure: true })
export class FilterDisplayPipe implements PipeTransform {
  transform(filters: GalleryFilters, def: AdditionalFilterDef): string {
    const minVal = String(filters[def.minKey] || def.sliderMin);
    const maxVal = String(filters[def.maxKey] || def.sliderMax);
    const prefix = def.displayPrefix ?? '';
    const suffix = def.displaySuffix ?? '';
    return `${prefix}${minVal}-${maxVal}${suffix}`;
  }
}
