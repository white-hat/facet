import { AdditionalFilterDef } from '../models/filter-def.model';

export function computeRangeFilterUpdate(
  def: AdditionalFilterDef,
  side: 'min' | 'max',
  value: number,
  currentMinValue: string | boolean | undefined,
): { key: string; value: string } {
  const effectiveSide = (side === 'max' && !currentMinValue) ? 'min' : side;
  const key = effectiveSide === 'min' ? def.minKey : def.maxKey;
  const boundary = effectiveSide === 'min' ? def.sliderMin : def.sliderMax;
  const filterValue = value === boundary ? '' : String(value);
  return { key, value: filterValue };
}
