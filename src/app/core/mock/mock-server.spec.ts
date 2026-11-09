import { ApplicationPayload } from '../models/application';
import { MockServer } from './mock-server';

const payload = (over: Partial<ApplicationPayload['banking']> = {}): ApplicationPayload => ({
  business: {
    legalName: 'Spec Co',
    tradingName: '',
    businessType: 'PRIVATE_LIMITED',
    registrationNumber: 'REG-SPEC01',
    website: '',
    category: 'Retail',
  },
  contact: {
    contactName: 'X',
    email: 'x@merchant.test',
    phone: '+9779800000000',
    addressLine: '1 Rd',
    city: 'KTM',
    country: 'NP',
    postalCode: '44600',
  },
  processing: {
    monthlyVolume: 1000,
    averageTicket: 10,
    maxTicket: 20,
    statementDescriptor: 'SPEC',
  },
  banking: {
    bankName: 'B',
    accountHolder: 'H',
    swiftCode: 'EXMPNPKA',
    accountNumber: '000011112222',
    taxId: 'TST999999',
    ...over,
  },
});

describe('MockServer (authorization is enforced server-side, not just hidden in UI)', () => {
  let server: MockServer;
  let now: number;

  const login = (email: string) => {
    const res = server.handle({
      method: 'POST',
      path: '/auth/login',
      query: new URLSearchParams(),
      body: { email },
      authorization: null,
    });
    return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
  };
  const call = (token: string, method: string, path: string, body: unknown = null, query = '') =>
    server.handle({
      method,
      path,
      query: new URLSearchParams(query),
      body,
      authorization: `Bearer ${token}`,
    });

  beforeEach(() => {
    now = Date.UTC(2026, 10, 1);
    server = new MockServer(() => now);
  });

  it('rejects requests without a valid token, and expired tokens', () => {
    expect(
      server.handle({
        method: 'GET',
        path: '/applications',
        query: new URLSearchParams(),
        body: null,
        authorization: null,
      }).status,
    ).toBe(401);
    const { accessToken } = login('sita.sales@portal.test');
    expect(call(accessToken, 'GET', '/applications').status).toBe(200);
    now += 61_000;
    expect(call(accessToken, 'GET', '/applications').status).toBe(401);
  });

  it('rotates refresh tokens: an old refresh token cannot be reused', () => {
    const { refreshToken } = login('sita.sales@portal.test');
    const first = server.handle({
      method: 'POST',
      path: '/auth/refresh',
      query: new URLSearchParams(),
      body: { refreshToken },
      authorization: null,
    });
    expect(first.status).toBe(200);
    const replay = server.handle({
      method: 'POST',
      path: '/auth/refresh',
      query: new URLSearchParams(),
      body: { refreshToken },
      authorization: null,
    });
    expect(replay.status).toBe(401);
  });

  it('SALES list only contains their own applications', () => {
    const { accessToken, user } = login('sita.sales@portal.test');
    const page = call(accessToken, 'GET', '/applications', null, 'pageSize=50').body as {
      items: { createdById: string }[];
    };
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((a) => a.createdById === user.id)).toBe(true);
  });

  it("another SALES user gets 404 (not 403) for someone else's application", () => {
    const sita = login('sita.sales@portal.test');
    const created = call(sita.accessToken, 'POST', '/applications', payload()).body as {
      id: string;
    };
    const sam = login('sam.sales@portal.test');
    expect(call(sam.accessToken, 'GET', `/applications/${created.id}`).status).toBe(404);
    expect(call(sam.accessToken, 'PUT', `/applications/${created.id}`, payload()).status).toBe(404);
  });

  it('never returns sensitive values in clear text from read endpoints', () => {
    const sita = login('sita.sales@portal.test');
    const created = call(sita.accessToken, 'POST', '/applications', payload()).body;
    const json = JSON.stringify(created);
    expect(json).not.toContain('000011112222');
    expect(json).not.toContain('TST999999');
    expect(json).toContain('•••• 2222');
  });

  it('keeps the stored secret when a save omits it (masked round-trip)', () => {
    const sita = login('sita.sales@portal.test');
    const { id } = call(sita.accessToken, 'POST', '/applications', payload()).body as {
      id: string;
    };
    const updated = call(
      sita.accessToken,
      'PUT',
      `/applications/${id}`,
      payload({ accountNumber: null, taxId: null }),
    ).body as {
      banking: { accountNumberMasked: string };
    };
    expect(updated.banking.accountNumberMasked).toBe('•••• 2222');
  });

  it('full workflow: SALES cannot review or reveal; ADMIN assigns; only assigned REVIEWER decides', () => {
    const sita = login('sita.sales@portal.test');
    const { id } = call(sita.accessToken, 'POST', '/applications', payload()).body as {
      id: string;
    };
    expect(call(sita.accessToken, 'POST', `/applications/${id}/submit`, payload()).status).toBe(
      200,
    );

    expect(
      call(sita.accessToken, 'POST', `/applications/${id}/review`, {
        decision: 'APPROVE',
        riskLevel: 'LOW',
        note: '',
      }).status,
    ).toBe(403);
    expect(
      call(sita.accessToken, 'POST', `/applications/${id}/reveal`, { field: 'accountNumber' })
        .status,
    ).toBe(403);

    const admin = login('asha.admin@portal.test');
    expect(
      call(admin.accessToken, 'POST', `/applications/${id}/assign`, { reviewerId: 'u-rev-1' })
        .status,
    ).toBe(200);

    const ravi = login('ravi.reviewer@portal.test'); // not assigned
    expect(
      call(ravi.accessToken, 'POST', `/applications/${id}/review`, {
        decision: 'APPROVE',
        riskLevel: 'LOW',
        note: '',
      }).status,
    ).toBe(404);

    const riya = login('riya.reviewer@portal.test');
    expect(
      call(riya.accessToken, 'POST', `/applications/${id}/review`, {
        decision: 'REJECT',
        riskLevel: 'HIGH',
        note: '',
      }).status,
    ).toBe(422);
    const reveal = call(riya.accessToken, 'POST', `/applications/${id}/reveal`, {
      field: 'accountNumber',
    });
    expect(reveal.body).toEqual({ field: 'accountNumber', value: '000011112222' });

    const decided = call(riya.accessToken, 'POST', `/applications/${id}/review`, {
      decision: 'APPROVE',
      riskLevel: 'LOW',
      note: 'ok',
    }).body as {
      status: string;
      riskHistory: { type: string }[];
    };
    expect(decided.status).toBe('APPROVED');
    expect(decided.riskHistory.map((e) => e.type)).toContain('REVEAL'); // reveal was audited
  });

  it('server-side validation rejects incomplete submissions with field errors', () => {
    const sita = login('sita.sales@portal.test');
    const bad = payload({ accountNumber: null });
    const { id } = call(sita.accessToken, 'POST', '/applications', bad).body as { id: string };
    const res = call(sita.accessToken, 'POST', `/applications/${id}/submit`, bad);
    expect(res.status).toBe(422);
    expect((res.body as { errors: Record<string, string> }).errors['banking.accountNumber']).toBe(
      'required',
    );
  });
});
