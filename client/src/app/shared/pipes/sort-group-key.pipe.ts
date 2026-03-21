import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sortGroupKey', standalone: true, pure: true })
export class SortGroupKeyPipe implements PipeTransform {
  transform(groupName: string): string {
    return groupName.toLowerCase().replace(/\s+/g, '_');
  }
}
