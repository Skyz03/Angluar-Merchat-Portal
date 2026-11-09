import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { forkJoin } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const USER = { id: 'u1', name: 'Test', email: 't@portal.test', role: 'SALES' as const };

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    auth.login(USER.email).subscribe();
    const login = ctrl.expectOne('/api/auth/login');
    expect(login.request.headers.has('Authorization')).toBe(false); // login never carries a bearer
    login.flush({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 60_000,
      user: USER,
    });
  });

  afterEach(() => ctrl.verify());

  it('attaches the bearer token to API requests only', () => {
    http.get('/api/applications').subscribe();
    http.get('https://cdn.example.com/x.json').subscribe();

    expect(ctrl.expectOne('/api/applications').request.headers.get('Authorization')).toBe(
      'Bearer at-1',
    );
    expect(
      ctrl.expectOne('https://cdn.example.com/x.json').request.headers.has('Authorization'),
    ).toBe(false);
  });

  it('refreshes ONCE when several concurrent requests get 401, then replays all of them', () => {
    const results: unknown[] = [];
    forkJoin([http.get('/api/a'), http.get('/api/b'), http.get('/api/c')]).subscribe((r) =>
      results.push(...r),
    );

    for (const url of ['/api/a', '/api/b', '/api/c']) {
      ctrl
        .expectOne(url)
        .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    }

    const refresh = ctrl.match('/api/auth/refresh');
    expect(refresh).toHaveLength(1);
    expect(refresh[0].request.body).toEqual({ refreshToken: 'rt-1' });
    refresh[0].flush({ accessToken: 'at-2', refreshToken: 'rt-2', expiresAt: Date.now() + 60_000 });

    for (const url of ['/api/a', '/api/b', '/api/c']) {
      const replay = ctrl.expectOne(url);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer at-2');
      replay.flush({ url });
    }

    expect(results).toEqual([{ url: '/api/a' }, { url: '/api/b' }, { url: '/api/c' }]);
    expect(auth.refreshCount()).toBe(1);
    expect(auth.token()).toBe('at-2');
  });

  it('a 401 for a token that was already replaced is replayed without another refresh', () => {
    http.get('/api/slow').subscribe();
    const slow = ctrl.expectOne('/api/slow'); // sent with at-1

    http.get('/api/fast').subscribe();
    ctrl.expectOne('/api/fast').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'at-2', refreshToken: 'rt-2', expiresAt: 0 });
    ctrl.expectOne('/api/fast').flush({});

    // The old request's 401 arrives AFTER the refresh completed.
    slow.flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectNone('/api/auth/refresh');
    expect(ctrl.expectOne('/api/slow').request.headers.get('Authorization')).toBe('Bearer at-2');
    expect(auth.refreshCount()).toBe(1);
  });

  it('logs out and propagates the error when the refresh itself fails', () => {
    let error: unknown;
    http.get('/api/a').subscribe({ error: (e) => (error = e) });
    ctrl.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(error).toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired' } });
  });

  it('does not loop: a replayed request that 401s again ends the session', () => {
    let status = 0;
    http.get('/api/a').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'at-2', refreshToken: 'rt-2', expiresAt: 0 });
    ctrl.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });

    ctrl.expectNone('/api/auth/refresh');
    expect(status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('passes non-401 errors straight through without refreshing', () => {
    let status = 0;
    http.get('/api/a').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/a').flush(null, { status: 403, statusText: 'Forbidden' });
    ctrl.expectNone('/api/auth/refresh');
    expect(status).toBe(403);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('never persists the access token to storage', () => {
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('at-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('at-1');
  });
});
