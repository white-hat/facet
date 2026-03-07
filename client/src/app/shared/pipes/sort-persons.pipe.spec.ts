import { SortPersonsPipe } from './sort-persons.pipe';

describe('SortPersonsPipe', () => {
  let pipe: SortPersonsPipe;

  beforeEach(() => {
    pipe = new SortPersonsPipe();
  });

  it('sorts persons alphabetically by name', () => {
    const persons = [
      { id: 1, name: 'Charlie' },
      { id: 2, name: 'Alice' },
      { id: 3, name: 'Bob' },
    ];
    expect(pipe.transform(persons, '')).toEqual([
      { id: 2, name: 'Alice' },
      { id: 3, name: 'Bob' },
      { id: 1, name: 'Charlie' },
    ]);
  });

  it('puts the selected person first', () => {
    const persons = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ];
    expect(pipe.transform(persons, '3')[0]).toEqual({ id: 3, name: 'Charlie' });
  });

  it('returns empty array for empty input', () => {
    expect(pipe.transform([], '')).toEqual([]);
  });

  it('handles null names', () => {
    const persons = [
      { id: 1, name: null as unknown as string },
      { id: 2, name: 'Alice' },
    ];
    expect(pipe.transform(persons, '')).toEqual([
      { id: 1, name: null as unknown as string },
      { id: 2, name: 'Alice' },
    ]);
  });

  it('does not mutate the original array', () => {
    const persons = [{ id: 2, name: 'Bob' }, { id: 1, name: 'Alice' }];
    pipe.transform(persons, '');
    expect(persons[0].name).toBe('Bob');
  });
});
