import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';

/** Formats timeline group dates: day → fullDate, week → "Week 46, 2025", month → "November 2025" */
@Pipe({ name: 'timelineDate', standalone: true })
export class TimelineDatePipe implements PipeTransform {
  private datePipe = new DatePipe('en-US');
  transform(dateStr: string): string {
    if (!dateStr) return '';
    // Week format: "2025-W46"
    const weekMatch = dateStr.match(/^(\d{4})-W(\d{2})$/);
    if (weekMatch) return `Week ${+weekMatch[2]}, ${weekMatch[1]}`;
    // Month format: "2025-11"
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return this.datePipe.transform(new Date(dateStr + '-15T12:00:00'), 'MMMM yyyy') ?? dateStr;
    }
    // Day format
    return this.datePipe.transform(new Date(dateStr + 'T12:00:00'), 'fullDate') ?? dateStr;
  }
}
