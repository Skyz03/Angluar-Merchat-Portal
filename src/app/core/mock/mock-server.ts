import {
  ApplicationDetail,
  ApplicationPayload,
  ApplicationStatus,
  ApplicationSummary,
  Page,
  ReviewDecision,
  ReviewRequest,
  RiskEvent,
  SENSITIVE_FIELDS,
  SensitiveField,
} from '../models/application';
import { LoginResponse, RefreshResponse, User } from '../models/user';
import {
  canAssign,
  canEdit,
  canReveal,
  canReview,
  canView,
  hasPermission,
} from '../auth/permissions';
import { DEMO_USERS, StoredApplication, seedApplications } from './seed';

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  authorization: string | null;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

class HttpFail extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const ACCESS_TOKEN_TTL_MS = 60_000;
export const MOCK_DB_KEY = 'mock-server.db';

/** Last 4 visible, everything else hidden. Never returns the raw value. */
export function maskValue(value: string | null): string | null {
  if (!value) return null;
  return `•••• ${value.slice(-4)}`;
}

/**
 * In-memory fake backend. Pure TypeScript (no Angular), so it is unit-testable and
 * authorization is enforced here with the SAME permission functions the UI uses.
 */
export class MockServer {
  private apps: StoredApplication[] = seedApplications();
  private accessTokens = new Map<string, { userId: string; expiresAt: number }>();
  private refreshTokens = new Map<string, string>(); // token -> userId
  private seq = 1000;

  /** Counters exposed for the dev toolbar and tests. */
  readonly stats = { refreshCalls: 0 };

  /**
   * @param storage Optional persistence so the fake "database" survives page reloads,
   *   like a real backend would. This is the mock SERVER's storage, standing in for a
   *   database; application code never writes sensitive values to browser storage.
   */
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  ) {
    this.load();
  }

  handle(req: MockRequest): MockResponse {
    try {
      const body = this.route(req);
      if (req.method !== 'GET') this.save();
      return { status: 200, body };
    } catch (e) {
      if (e instanceof HttpFail)
        return { status: e.status, body: { message: e.message, errors: e.details } };
      throw e;
    }
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(MOCK_DB_KEY);
      if (!raw) return;
      const db = JSON.parse(raw) as {
        apps: StoredApplication[];
        refreshTokens: [string, string][];
        seq: number;
      };
      this.apps = db.apps;
      this.refreshTokens = new Map(db.refreshTokens);
      this.seq = db.seq;
    } catch {
      /* corrupt: start from seed */
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(
        MOCK_DB_KEY,
        JSON.stringify({ apps: this.apps, refreshTokens: [...this.refreshTokens], seq: this.seq }),
      );
    } catch {
      /* quota: in-memory only */
    }
  }

  /** Dev helper: invalidate every access token so the next calls 401 together. */
  expireAllAccessTokens(): void {
    this.accessTokens.clear();
  }

  // ---------------------------------------------------------------- routing

  private route(req: MockRequest): unknown {
    const { method, path } = req;
    const seg = path.split('/').filter(Boolean); // ['auth','login'] | ['applications', id, action]

    if (method === 'POST' && path === '/auth/login') return this.login(req.body);
    if (method === 'POST' && path === '/auth/refresh') return this.refresh(req.body);

    const user = this.authenticate(req.authorization);

    if (method === 'GET' && path === '/users/reviewers') {
      if (!hasPermission(user, 'application:assign')) throw new HttpFail(403, 'Forbidden');
      return DEMO_USERS.filter((u) => u.role === 'REVIEWER');
    }

    if (seg[0] !== 'applications') throw new HttpFail(404, 'Not found');

    if (seg.length === 1) {
      if (method === 'GET') return this.list(user, req.query);
      if (method === 'POST') return this.create(user, req.body as ApplicationPayload);
    }
    if (seg[1] === 'registration-check' && method === 'GET') {
      const reg = (req.query.get('registrationNumber') ?? '').trim().toUpperCase();
      const exclude = req.query.get('excludeId');
      return {
        taken: this.apps.some(
          (a) => a.id !== exclude && a.data.business.registrationNumber.toUpperCase() === reg,
        ),
      };
    }

    const app = this.find(seg[1]);
    if (!canView(user, app)) {
      // 404 rather than 403 so callers cannot probe which IDs exist.
      throw new HttpFail(404, 'Application not found');
    }

    if (seg.length === 2) {
      if (method === 'GET') return this.toDetail(app);
      if (method === 'PUT') return this.update(user, app, req.body as ApplicationPayload);
    }
    if (method === 'POST') {
      switch (seg[2]) {
        case 'submit':
          return this.submit(user, app, req.body as ApplicationPayload);
        case 'review':
          return this.review(user, app, req.body as ReviewRequest);
        case 'assign':
          return this.assign(user, app, (req.body as { reviewerId: string }).reviewerId);
        case 'reveal':
          return this.reveal(user, app, (req.body as { field: SensitiveField }).field);
      }
    }
    throw new HttpFail(404, 'Not found');
  }

  // ------------------------------------------------------------------- auth

  private login(body: unknown): LoginResponse {
    // Demo personas only: there are deliberately NO passwords anywhere in this repo.
    const email = (body as { email?: string })?.email?.toLowerCase();
    const user = DEMO_USERS.find((u) => u.email === email);
    if (!user) throw new HttpFail(401, 'Unknown demo user');
    return { ...this.issueTokens(user.id), user };
  }

  private refresh(body: unknown): RefreshResponse {
    this.stats.refreshCalls++;
    const token = (body as { refreshToken?: string })?.refreshToken ?? '';
    const userId = this.refreshTokens.get(token);
    if (!userId) throw new HttpFail(401, 'Refresh token invalid or already used');
    this.refreshTokens.delete(token); // rotation: each refresh token is single-use
    return this.issueTokens(userId);
  }

  private issueTokens(userId: string): RefreshResponse {
    const accessToken = `at_${crypto.randomUUID()}`;
    const refreshToken = `rt_${crypto.randomUUID()}`;
    const expiresAt = this.now() + ACCESS_TOKEN_TTL_MS;
    this.accessTokens.set(accessToken, { userId, expiresAt });
    this.refreshTokens.set(refreshToken, userId);
    return { accessToken, refreshToken, expiresAt };
  }

  private authenticate(header: string | null): User {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const session = token ? this.accessTokens.get(token) : undefined;
    if (!session || session.expiresAt <= this.now())
      throw new HttpFail(401, 'Access token missing or expired');
    return DEMO_USERS.find((u) => u.id === session.userId)!;
  }

  // ------------------------------------------------------------ applications

  private list(user: User, q: URLSearchParams): Page<ApplicationSummary> {
    const page = Math.max(1, Number(q.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(q.get('pageSize')) || 10));
    const search = (q.get('search') ?? '').trim().toLowerCase();
    const status = (q.get('status') ?? '') as ApplicationStatus | '';

    const visible = this.apps.filter((a) => canView(user, a));
    const searched = visible.filter(
      (a) =>
        !search ||
        a.data.business.legalName.toLowerCase().includes(search) ||
        a.reference.toLowerCase().includes(search),
    );
    const counts: Partial<Record<ApplicationStatus, number>> = {};
    for (const a of searched) counts[a.status] = (counts[a.status] ?? 0) + 1;

    const filtered = searched
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map((a) => this.toSummary(a)),
      total: filtered.length,
      page,
      pageSize,
      counts,
    };
  }

  private create(user: User, payload: ApplicationPayload): ApplicationDetail {
    if (!hasPermission(user, 'application:create'))
      throw new HttpFail(403, 'Only SALES can create applications');
    const n = ++this.seq;
    const now = new Date(this.now()).toISOString();
    const app: StoredApplication = {
      id: `app-${n}`,
      reference: `MA-2026${n}`,
      status: 'DRAFT',
      createdById: user.id,
      assignedReviewerId: null,
      riskLevel: null,
      updatedAt: now,
      version: 1,
      data: this.stripSensitive(payload),
      secrets: { accountNumber: null, taxId: null },
      riskHistory: [this.event(user, 'CREATED')],
    };
    this.applySecrets(app, payload);
    this.apps.unshift(app);
    return this.toDetail(app);
  }

  private update(
    user: User,
    app: StoredApplication,
    payload: ApplicationPayload,
  ): ApplicationDetail {
    if (!canEdit(user, app)) throw new HttpFail(403, 'Application is not editable');
    app.data = this.stripSensitive(payload);
    this.applySecrets(app, payload);
    this.touch(app);
    return this.toDetail(app);
  }

  private submit(
    user: User,
    app: StoredApplication,
    payload: ApplicationPayload,
  ): ApplicationDetail {
    if (!canEdit(user, app)) throw new HttpFail(403, 'Application is not editable');
    app.data = this.stripSensitive(payload);
    this.applySecrets(app, payload);
    const errors = this.validateComplete(app);
    if (Object.keys(errors).length) throw new HttpFail(422, 'Application incomplete', errors);

    const resubmission = app.status === 'INFO_REQUESTED';
    app.status = resubmission && app.assignedReviewerId ? 'IN_REVIEW' : 'SUBMITTED';
    app.riskHistory.push(this.event(user, resubmission ? 'RESUBMITTED' : 'SUBMITTED'));
    this.touch(app);
    return this.toDetail(app);
  }

  private review(user: User, app: StoredApplication, body: ReviewRequest): ApplicationDetail {
    if (!canReview(user, app)) throw new HttpFail(403, 'You cannot review this application');
    const next: Record<ReviewDecision, ApplicationStatus> = {
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      REQUEST_INFO: 'INFO_REQUESTED',
    };
    if (!next[body?.decision]) throw new HttpFail(422, 'Invalid decision');
    if (body.decision !== 'APPROVE' && !body.note?.trim())
      throw new HttpFail(422, 'A note is required', { note: 'required' });

    app.status = next[body.decision];
    app.riskLevel = body.riskLevel;
    app.riskHistory.push({
      ...this.event(user, 'DECISION'),
      decision: body.decision,
      riskLevel: body.riskLevel,
      note: body.note?.trim(),
    });
    this.touch(app);
    return this.toDetail(app);
  }

  private assign(user: User, app: StoredApplication, reviewerId: string): ApplicationDetail {
    if (!canAssign(user, app)) throw new HttpFail(403, 'You cannot assign this application');
    const reviewer = DEMO_USERS.find((u) => u.id === reviewerId && u.role === 'REVIEWER');
    if (!reviewer) throw new HttpFail(422, 'Unknown reviewer');
    app.assignedReviewerId = reviewer.id;
    if (app.status === 'SUBMITTED') app.status = 'IN_REVIEW';
    app.riskHistory.push({ ...this.event(user, 'ASSIGNED'), note: `Assigned to ${reviewer.name}` });
    this.touch(app);
    return this.toDetail(app);
  }

  private reveal(
    user: User,
    app: StoredApplication,
    field: SensitiveField,
  ): { field: SensitiveField; value: string } {
    if (!SENSITIVE_FIELDS.includes(field)) throw new HttpFail(422, 'Unknown field');
    if (!canReveal(user, app)) throw new HttpFail(403, 'Not permitted to reveal sensitive data');
    const value = app.secrets[field];
    if (!value) throw new HttpFail(404, 'No value on file');
    // Every reveal is audited on the application's history.
    app.riskHistory.push({
      ...this.event(user, 'REVEAL'),
      note: `Revealed ${field === 'accountNumber' ? 'account number' : 'tax ID'}`,
    });
    return { field, value };
  }

  // ---------------------------------------------------------------- helpers

  private find(id: string): StoredApplication {
    const app = this.apps.find((a) => a.id === id);
    if (!app) throw new HttpFail(404, 'Application not found');
    return app;
  }

  private stripSensitive(p: ApplicationPayload): StoredApplication['data'] {
    const { bankName, accountHolder, swiftCode } =
      p?.banking ?? ({} as ApplicationPayload['banking']);
    return {
      business: { ...p.business },
      contact: { ...p.contact },
      processing: { ...p.processing },
      banking: {
        bankName: bankName ?? '',
        accountHolder: accountHolder ?? '',
        swiftCode: swiftCode ?? '',
      },
    };
  }

  /** Empty/null means "keep what we have" so the client never needs the raw value back. */
  private applySecrets(app: StoredApplication, p: ApplicationPayload): void {
    if (p?.banking?.accountNumber)
      app.secrets.accountNumber = p.banking.accountNumber.replace(/\s+/g, '');
    if (p?.banking?.taxId) app.secrets.taxId = p.banking.taxId.trim().toUpperCase();
  }

  private validateComplete(app: StoredApplication): Record<string, string> {
    const errors: Record<string, string> = {};
    const { business, contact, processing, banking } = app.data;
    const required: [string, unknown][] = [
      ['business.legalName', business.legalName],
      ['business.businessType', business.businessType],
      ['business.registrationNumber', business.registrationNumber],
      ['contact.contactName', contact.contactName],
      ['contact.email', contact.email],
      ['contact.phone', contact.phone],
      ['processing.monthlyVolume', processing.monthlyVolume],
      ['processing.averageTicket', processing.averageTicket],
      ['banking.bankName', banking.bankName],
      ['banking.accountNumber', app.secrets.accountNumber],
      ['banking.taxId', app.secrets.taxId],
    ];
    for (const [key, v] of required)
      if (v === null || v === undefined || v === '') errors[key] = 'required';
    if ((processing.maxTicket ?? 0) < (processing.averageTicket ?? 0))
      errors['processing.maxTicket'] = 'lessThanAverage';
    return errors;
  }

  private touch(app: StoredApplication): void {
    app.updatedAt = new Date(this.now()).toISOString();
    app.version++;
  }

  private event(user: User, type: RiskEvent['type']): RiskEvent {
    return {
      id: `ev-${++this.seq}`,
      at: new Date(this.now()).toISOString(),
      actorName: user.name,
      actorRole: user.role,
      type,
    };
  }

  private toSummary(a: StoredApplication): ApplicationSummary {
    const owner = DEMO_USERS.find((u) => u.id === a.createdById);
    const reviewer = DEMO_USERS.find((u) => u.id === a.assignedReviewerId);
    return {
      id: a.id,
      reference: a.reference,
      legalName: a.data.business.legalName || '(untitled draft)',
      status: a.status,
      createdById: a.createdById,
      createdByName: owner?.name ?? 'Unknown',
      assignedReviewerId: a.assignedReviewerId,
      assignedReviewerName: reviewer?.name ?? null,
      riskLevel: a.riskLevel,
      updatedAt: a.updatedAt,
    };
  }

  private toDetail(a: StoredApplication): ApplicationDetail {
    return {
      ...this.toSummary(a),
      business: { ...a.data.business },
      contact: { ...a.data.contact },
      processing: { ...a.data.processing },
      banking: {
        ...a.data.banking,
        accountNumberMasked: maskValue(a.secrets.accountNumber),
        taxIdMasked: maskValue(a.secrets.taxId),
      },
      riskHistory: [...a.riskHistory].sort((x, y) => y.at.localeCompare(x.at)),
      version: a.version,
    };
  }
}
