export interface AdditionalFilterDef {
  id: string;
  labelKey: string;
  sectionKey: string;
  minKey: string;
  maxKey: string;
  sliderMin: number;
  sliderMax: number;
  step: number;
  displaySuffix?: string;
  displayPrefix?: string;
  spanWidth: string;
}
