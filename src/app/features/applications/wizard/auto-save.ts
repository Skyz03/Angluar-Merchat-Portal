import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  catchError,
  concatMap,
  debounceTime,
  defer,
  map,
  merge,
  retry,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { httpErrorMessage } from '../../../shared/util/load-state';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions<T> {
  /** Emits whenever the user edits something. */
  changes$: Observable<unknown>;
  /** Reads the CURRENT value at save time (so queued saves always send the latest state). */
  snapshot: () => T;
  save: (value: T) => Observable<unknown>;
  debounceMs?: number;
  /** Automatic retries (exponential backoff) before surfacing an error. */
  retries?: number;
  retryBaseMs?: number;
  destroyRef: DestroyRef;
}

/**
 * Debounced, ordered, failure-tolerant auto-save.
 *
 *  changes$ ──debounce──┐
 *  saveNow() ───────────┴─▶ concatMap(save latest) ─ retry w/ backoff ─ catchError
 *
 * - concatMap: saves never overlap or arrive out of order (switchMap could cancel a
 *   request the server already processed and then race the next one).
 * - snapshot() is read when the save STARTS, and identical snapshots are skipped,
 *   so a burst of queued triggers collapses into one request.
 * - Errors are caught inside the inner stream: the pipeline stays alive, form
 *   state is never touched, and the next edit (or saveNow) tries again.
 */
export class AutoSave<T> {
  readonly status = signal<SaveStatus>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  readonly error = signal<string | null>(null);

  private readonly manual$ = new Subject<void>();
  /** Arbitrary work (e.g. submit) that must run strictly after any in-flight save. */
  private readonly exclusive$ = new Subject<() => Observable<unknown>>();
  private lastSavedJson: string | null = null;
  /** Incremented on every edit, so a save that finishes while newer edits exist reports 'pending', not 'saved'. */
  private editSeq = 0;

  constructor(private readonly opts: AutoSaveOptions<T>) {
    const debounced$ = opts.changes$.pipe(
      tap(() => {
        this.editSeq++;
        this.status.set('pending');
      }),
      debounceTime(opts.debounceMs ?? 1500),
    );

    const save = () => this.saveLatest();
    merge(debounced$.pipe(map(() => save)), this.manual$.pipe(map(() => save)), this.exclusive$)
      .pipe(
        concatMap((work) => defer(work)),
        takeUntilDestroyed(opts.destroyRef),
      )
      .subscribe();
  }

  /** Mark the current state as already persisted (e.g. right after loading from the server). */
  markSaved(value: T): void {
    this.lastSavedJson = JSON.stringify(value);
  }

  /** Skip the debounce (Retry button, before submit, before leaving the page). */
  saveNow(): void {
    this.manual$.next();
  }

  /**
   * Queue work behind any pending/in-flight save, e.g. "submit" must never race a
   * draft PUT (or a first POST that hasn't returned an id yet).
   */
  runExclusive<R>(work: () => Observable<R>): Observable<R> {
    const result = new ReplaySubject<R>(1);
    this.exclusive$.next(() =>
      work().pipe(
        tap({
          next: (v) => result.next(v),
          error: (e: unknown) => result.error(e),
          complete: () => result.complete(),
        }),
        catchError(() => EMPTY), // error is delivered to the caller; the queue keeps running
      ),
    );
    return result.asObservable();
  }

  get hasUnsavedChanges(): boolean {
    const s = this.status();
    return s === 'pending' || s === 'saving' || s === 'error';
  }

  private saveLatest(): Observable<unknown> {
    const value = this.opts.snapshot();
    const json = JSON.stringify(value);
    if (json === this.lastSavedJson) {
      if (this.status() === 'pending') this.status.set(this.lastSavedAt() ? 'saved' : 'idle');
      return EMPTY;
    }

    this.status.set('saving');
    this.error.set(null);
    const base = this.opts.retryBaseMs ?? 1000;
    const seqAtStart = this.editSeq;

    return this.opts.save(value).pipe(
      retry({
        count: this.opts.retries ?? 2,
        // Only transient failures are retried; a 4xx (403, 422…) won't fix itself.
        delay: (err: unknown, attempt) =>
          isTransient(err) ? timer(base * 2 ** (attempt - 1)) : throwError(() => err),
      }),
      tap(() => {
        this.lastSavedJson = json;
        this.lastSavedAt.set(new Date());
        this.status.set(this.editSeq === seqAtStart ? 'saved' : 'pending');
      }),
      catchError((err: unknown) => {
        this.status.set('error');
        this.error.set(httpErrorMessage(err));
        return EMPTY;
      }),
    );
  }
}

function isTransient(err: unknown): boolean {
  return (
    !(err instanceof HttpErrorResponse) ||
    err.status === 0 ||
    err.status === 408 ||
    err.status === 429 ||
    err.status >= 500
  );
}
