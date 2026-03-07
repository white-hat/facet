import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sortPersons', standalone: true, pure: true })
export class SortPersonsPipe implements PipeTransform {
  transform(persons: { id: number; name: string }[], selectedId: string): { id: number; name: string }[] {
    return [...persons].sort((a, b) => {
      const aSelected = selectedId === '' + a.id;
      const bSelected = selectedId === '' + b.id;
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }
}
