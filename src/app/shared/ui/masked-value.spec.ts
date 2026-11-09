import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApplicationsApi } from '../../core/api/applications.api';
import { MaskedValue, REVEAL_DURATION_MS } from './masked-value';

describe('MaskedValue', () => {
  const reveal = vi.fn(() => of({ field: 'accountNumber' as const, value: '000011112222' }));

  const render = async (canReveal: boolean) => {
    const fixture = TestBed.createComponent(MaskedValue);
    fixture.componentRef.setInput('applicationId', 'app-1');
    fixture.componentRef.setInput('field', 'accountNumber');
    fixture.componentRef.setInput('masked', '•••• 2222');
    fixture.componentRef.setInput('canReveal', canReveal);
    await fixture.whenStable();
    return fixture;
  };
  const text = (el: HTMLElement) =>
    el.querySelector('[data-testid=masked-text]')!.textContent!.trim();

  beforeEach(() => {
    reveal.mockClear();
    TestBed.configureTestingModule({
      imports: [MaskedValue],
      providers: [{ provide: ApplicationsApi, useValue: { reveal } }],
    });
  });

  it('is masked by default and has no reveal control without permission', async () => {
    const f = await render(false);
    expect(text(f.nativeElement)).toBe('•••• 2222');
    expect(f.nativeElement.querySelector('[data-testid=reveal-btn]')).toBeNull();
  });

  it('reveals via the API on demand, then re-masks automatically', async () => {
    const f = await render(true); // render with real timers (whenStable), then fake the clock
    vi.useFakeTimers();
    try {
      f.nativeElement.querySelector('[data-testid=reveal-btn]').click();
      f.detectChanges();
      expect(reveal).toHaveBeenCalledWith('app-1', 'accountNumber');
      expect(text(f.nativeElement)).toBe('000011112222');

      await vi.advanceTimersByTimeAsync(REVEAL_DURATION_MS - 1);
      f.detectChanges();
      expect(text(f.nativeElement)).toBe('000011112222');
      await vi.advanceTimersByTimeAsync(1);
      f.detectChanges();
      expect(text(f.nativeElement)).toBe('•••• 2222');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Hide re-masks immediately', async () => {
    const f = await render(true);
    const btn = f.nativeElement.querySelector('[data-testid=reveal-btn]') as HTMLButtonElement;
    btn.click();
    await f.whenStable();
    btn.click();
    await f.whenStable();
    expect(text(f.nativeElement)).toBe('•••• 2222');
  });
});
