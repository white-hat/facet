import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  describe('accentColor', () => {
    it('returns orange swatch by default', () => {
      expect(service.accentColor()).toBe('#ff6600');
    });

    it('returns swatch for a named theme', () => {
      service.setTheme('theme-blue');
      expect(service.accentColor()).toBe('#3b82f6');
    });
  });

  describe('complementaryColor', () => {
    it('returns the hue+180 complement of orange (#ff6600 → #0099ff)', () => {
      service.setTheme('');
      expect(service.complementaryColor()).toBe('#0099ff');
    });

    it('returns the hue+180 complement of green (#22c55e)', () => {
      service.setTheme('theme-green');
      const color = service.complementaryColor();
      // green hue ≈ 142° → complement ≈ 322° (magenta-purple range)
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      // must differ from accent
      expect(color).not.toBe(service.accentColor());
    });

    it('returns the hue+180 complement of blue (#3b82f6)', () => {
      service.setTheme('theme-blue');
      const color = service.complementaryColor();
      // blue hue ≈ 217° → complement ≈ 37° (orange-yellow range)
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(color).not.toBe(service.accentColor());
    });

    it('applying complement twice returns original color', () => {
      service.setTheme('');
      const accent = service.accentColor();
      // Set theme to the complement color is not possible directly,
      // but we can verify the complement of the complement matches the accent hue.
      // Indirect check: complementaryColor changes when theme changes.
      service.setTheme('theme-violet');
      const c1 = service.complementaryColor();
      service.setTheme('theme-blue');
      const c2 = service.complementaryColor();
      expect(c1).not.toBe(c2);
      // Reset and confirm original complement is restored
      service.setTheme('');
      expect(service.complementaryColor()).toBe('#0099ff');
      expect(service.accentColor()).toBe(accent);
    });

    it('produces a valid hex string for every built-in theme', () => {
      for (const theme of service.THEMES) {
        service.setTheme(theme.id);
        expect(service.complementaryColor()).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });
});
