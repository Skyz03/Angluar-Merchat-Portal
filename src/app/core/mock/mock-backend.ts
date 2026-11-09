import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { mergeMap, timer } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { MockServer } from './mock-server';

/** Knobs for demoing failure paths from the dev toolbar. */
@Injectable({ providedIn: 'root' })
export class MockBackendControls {
  readonly server = new MockServer(() => Date.now(), safeSessionStorage());
  /** 0..1 chance that a list or draft-save call fails with 503. */
  readonly failureRate = signal(0);
  readonly latencyMs = signal(400);
  readonly random = signal<() => number>(Math.random);
}

const CHAOS_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: 'GET', pattern: /^\/applications$/ },
  { method: 'POST', pattern: /^\/applications$/ },
  { method: 'PUT', pattern: /^\/applications\/[^/]+$/ },
];

/**
 * Stands in for a real API during development. Registered LAST in the interceptor
 * chain, so the real auth interceptor runs in front of it exactly as it would
 * against a real backend (headers, 401s, refresh, replay).
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base)) return next(req);

  const controls = inject(MockBackendControls);
  const url = new URL(req.urlWithParams, 'http://mock.local');
  const path = url.pathname.slice(base.length) || '/';

  const chaos = CHAOS_ROUTES.some((r) => r.method === req.method && r.pattern.test(path));
  const fail = chaos && controls.random()() < controls.failureRate();

  const res = fail
    ? { status: 503, body: { message: 'Simulated outage (dev toolbar)' } }
    : controls.server.handle({
        method: req.method,
        path,
        query: url.searchParams,
        body: req.body ? structuredClone(req.body) : null,
        authorization: req.headers.get('Authorization'),
      });

  // structuredClone so the UI can never mutate server state by reference.
  const body = structuredClone(res.body);
  const jitter = Math.round(controls.latencyMs() * (0.6 + controls.random()() * 0.8));

  return timer(jitter).pipe(
    mergeMap(() => {
      if (res.status >= 400) {
        throw new HttpErrorResponse({
          status: res.status,
          statusText: 'Mock error',
          error: body,
          url: req.url,
        });
      }
      return [new HttpResponse({ status: res.status, body, url: req.url })];
    }),
  );
};

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
