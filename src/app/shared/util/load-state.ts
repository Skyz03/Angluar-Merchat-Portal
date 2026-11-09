import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, combineLatest, map, of, scan, startWith, switchMap } from 'rxjs';

export interface LoadState<T> {
  loading: boolean;
  /** Last successful data; kept while re-loading so the table doesn't flash empty. */
  data: T | null;
  error: string | null;
}

export const initialLoadState = <T>(): LoadState<T> => ({ loading: true, data: null, error: null });

export function httpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Network error — check your connection.';
    if (err.status === 403) return 'You do not have permission to do that.';
    if (err.status === 404) return 'Not found, or you do not have access.';
    if (err.status >= 500) return 'The server is having trouble. Please try again.';
    const msg = (err.error as { message?: string } | null)?.message;
    if (msg) return msg;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * query$ ─┬─ switchMap(fetch) ─▶ LoadState
 * retry$ ─┘
 * - switchMap cancels stale requests when filters change quickly.
 * - Errors are caught per request so the outer stream never dies and Retry works.
 */
export function loadState<Q, T>(
  query$: Observable<Q>,
  retry$: Observable<unknown>,
  fetch: (q: Q) => Observable<T>,
): Observable<LoadState<T>> {
  type Patch = Partial<LoadState<T>>;
  return combineLatest([query$, retry$.pipe(startWith(null))]).pipe(
    switchMap(([q]) =>
      fetch(q).pipe(
        map((data): Patch => ({ loading: false, data, error: null })),
        catchError((err: unknown) => of<Patch>({ loading: false, error: httpErrorMessage(err) })),
        startWith<Patch>({ loading: true, error: null }),
      ),
    ),
    scan((state: LoadState<T>, patch: Patch) => ({ ...state, ...patch }), initialLoadState<T>()),
  );
}
