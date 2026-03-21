import { SortGroupKeyPipe } from './sort-group-key.pipe';

describe('SortGroupKeyPipe', () => {
  let pipe: SortGroupKeyPipe;

  beforeEach(() => {
    pipe = new SortGroupKeyPipe();
  });

  it('converts space-separated words to snake_case', () => {
    expect(pipe.transform('Subject Saliency')).toBe('subject_saliency');
  });

  it('lowercases single words', () => {
    expect(pipe.transform('Camera')).toBe('camera');
  });

  it('handles multiple spaces', () => {
    expect(pipe.transform('Face  Metrics')).toBe('face_metrics');
  });

  it('passes through already lowercase', () => {
    expect(pipe.transform('color')).toBe('color');
  });
});
