import { FormControl, FormGroup } from '@angular/forms';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { httpsUrl, postalCodeForCountry, ticketSizes, uniqueRegistration } from './validators';

describe('validators', () => {
  it('httpsUrl allows empty and https, rejects http and junk', () => {
    expect(httpsUrl(new FormControl(''))).toBeNull();
    expect(httpsUrl(new FormControl('https://shop.example'))).toBeNull();
    expect(httpsUrl(new FormControl('http://shop.example'))).toEqual({ httpsUrl: true });
    expect(httpsUrl(new FormControl('javascript:alert(1)'))).toEqual({ httpsUrl: true });
    expect(httpsUrl(new FormControl('not a url'))).toEqual({ httpsUrl: true });
  });

  describe('postalCodeForCountry (cross-field)', () => {
    const group = () =>
      new FormGroup(
        { country: new FormControl('NP'), postalCode: new FormControl('') },
        { validators: postalCodeForCountry },
      );

    it('validates against the selected country and mirrors the error onto postalCode', () => {
      const g = group();
      g.controls.postalCode.setValue('123');
      expect(g.hasError('postalCodeCountry')).toBe(true);
      expect(g.controls.postalCode.hasError('postalCodeCountry')).toBe(true);

      g.controls.postalCode.setValue('44600');
      expect(g.valid).toBe(true);
    });

    it('re-validates when only the country changes', () => {
      const g = group();
      g.controls.postalCode.setValue('44600'); // valid NP
      g.controls.country.setValue('IN'); // IN needs 6 digits
      expect(g.controls.postalCode.hasError('postalCodeCountry')).toBe(true);
      g.controls.country.setValue('US');
      expect(g.controls.postalCode.valid).toBe(true);
    });
  });

  describe('ticketSizes (cross-field)', () => {
    const g = new FormGroup(
      {
        monthlyVolume: new FormControl<number | null>(1000),
        averageTicket: new FormControl<number | null>(100),
        maxTicket: new FormControl<number | null>(50),
      },
      { validators: ticketSizes },
    );

    it('flags max < average on the maxTicket control', () => {
      expect(g.controls.maxTicket.hasError('maxBelowAverage')).toBe(true);
      g.controls.maxTicket.setValue(500);
      expect(g.controls.maxTicket.valid).toBe(true);
    });

    it('flags average > monthly volume', () => {
      g.controls.averageTicket.setValue(2000);
      expect(g.controls.averageTicket.hasError('averageAboveVolume')).toBe(true);
    });
  });

  describe('uniqueRegistration (async, debounced)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const run = async (check: (v: string) => Observable<boolean>, value = 'REG-12345') => {
      const result = firstValueFrom(
        uniqueRegistration(check, 300)(new FormControl(value)) as Observable<unknown>,
      );
      await vi.advanceTimersByTimeAsync(300);
      return result;
    };

    it('reports taken numbers', async () => {
      expect(await run(() => of(true))).toEqual({ registrationTaken: true });
      expect(await run(() => of(false))).toBeNull();
    });

    it('fails open on network error (server re-validates on submit)', async () => {
      expect(await run(() => throwError(() => new Error('offline')))).toBeNull();
    });

    it('does not call the API for empty values', async () => {
      const check = vi.fn(() => of(true));
      expect(
        await firstValueFrom(uniqueRegistration(check)(new FormControl('')) as Observable<unknown>),
      ).toBeNull();
      expect(check).not.toHaveBeenCalled();
    });
  });
});
