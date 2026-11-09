import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, defer, map, of, throwError, timer } from 'rxjs';
import { AutoSave } from './auto-save';

describe('AutoSave', () => {
  let changes$: Subject<void>;
  let value: { name: string };
  let save: ReturnType<typeof vi.fn<(v: { name: string }) => Observable<unknown>>>;

  const create = () =>
    TestBed.runInInjectionContext(
      () =>
        new AutoSave({
          changes$,
          snapshot: () => ({ ...value }),
          save,
          debounceMs: 1000,
          retries: 2,
          retryBaseMs: 100,
          destroyRef: TestBed.inject(DestroyRef),
        }),
    );

  const edit = (name: string) => {
    value = { name };
    changes$.next();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    changes$ = new Subject<void>();
    value = { name: '' };
    save = vi.fn((v: { name: string }) => of(v));
  });
  afterEach(() => vi.useRealTimers());

  it('debounces a burst of edits into one save with the latest value', async () => {
    const as = create();
    edit('a');
    edit('ab');
    edit('abc');
    expect(as.status()).toBe('pending');
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: 'abc' });
    expect(as.status()).toBe('saved');
    expect(as.lastSavedAt()).toBeInstanceOf(Date);
  });

  it('skips saving when nothing actually changed', async () => {
    const as = create();
    as.markSaved({ name: 'same' });
    edit('same');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('retries transient errors with backoff, then succeeds', async () => {
    let calls = 0;
    // defer = cold, like HttpClient: every retry re-subscribes and re-sends.
    save.mockImplementation((v) =>
      defer(() => {
        calls++;
        return calls < 3 ? throwError(() => new HttpErrorResponse({ status: 503 })) : of(v);
      }),
    );
    const as = create();
    edit('x');
    await vi.advanceTimersByTimeAsync(1000); // debounce
    await vi.advanceTimersByTimeAsync(100 + 200); // backoff 100ms, 200ms
    expect(calls).toBe(3);
    expect(as.status()).toBe('saved');
  });

  it('surfaces an error after retries without touching the value, and recovers on saveNow()', async () => {
    let fail = true;
    save.mockImplementation((v) =>
      defer(() => (fail ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(v))),
    );
    const as = create();
    edit('keep me');
    await vi.advanceTimersByTimeAsync(1000 + 100 + 200);
    expect(as.status()).toBe('error');
    expect(as.error()).toContain('server');
    expect(as.hasUnsavedChanges).toBe(true);
    expect(value).toEqual({ name: 'keep me' }); // form state never reset

    fail = false;
    as.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(as.status()).toBe('saved');
    expect(save).toHaveBeenLastCalledWith({ name: 'keep me' });
  });

  it('does not retry client errors (e.g. 403)', async () => {
    save.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 403 })));
    const as = create();
    edit('x');
    await vi.advanceTimersByTimeAsync(1000 + 1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(as.status()).toBe('error');
  });

  it('never overlaps saves: a second save waits for the first (ordering preserved)', async () => {
    const log: string[] = [];
    save.mockImplementation((v) => {
      log.push(`start ${v.name}`);
      return timer(500).pipe(map(() => log.push(`end ${v.name}`)));
    });
    const as = create();
    edit('one');
    await vi.advanceTimersByTimeAsync(1000); // save "one" starts
    edit('two');
    await vi.advanceTimersByTimeAsync(1000); // debounce for "two" fires while "one" in flight? (500ms → already done)
    await vi.advanceTimersByTimeAsync(500);
    expect(log).toEqual(['start one', 'end one', 'start two', 'end two']);
    expect(as.status()).toBe('saved');
  });

  it('reports "pending" (not "saved") if the user kept typing during a save', async () => {
    save.mockImplementation((v) => timer(500).pipe(map(() => v)));
    const as = create();
    edit('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(as.status()).toBe('saving');
    edit('ab');
    await vi.advanceTimersByTimeAsync(500);
    expect(as.status()).toBe('pending');
  });

  it('runExclusive queues work behind an in-flight save', async () => {
    const order: string[] = [];
    save.mockImplementation((v) => timer(500).pipe(map(() => order.push('save:' + v.name))));
    const as = create();
    edit('draft');
    await vi.advanceTimersByTimeAsync(1000); // save in flight

    let done = false;
    as.runExclusive(() => of('submitted').pipe(map((x) => order.push(x)))).subscribe(
      () => (done = true),
    );
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual(['save:draft', 'submitted']);
    expect(done).toBe(true);
  });
});
