import {
  ApplicationPayload,
  ApplicationStatus,
  BusinessType,
  RiskEvent,
  RiskLevel,
} from '../models/application';
import { User } from '../models/user';

/**
 * ALL DATA HERE IS SYNTHETIC. Names are invented, emails use the reserved `.test`
 * TLD, and account/tax numbers are generated digit strings that do not pass any
 * real bank or tax-authority checksum. No real people, customers or card data.
 */
export const DEMO_USERS: readonly User[] = [
  { id: 'u-sales-1', name: 'Sita Sales', email: 'sita.sales@portal.test', role: 'SALES' },
  { id: 'u-sales-2', name: 'Sam Sales', email: 'sam.sales@portal.test', role: 'SALES' },
  { id: 'u-rev-1', name: 'Riya Reviewer', email: 'riya.reviewer@portal.test', role: 'REVIEWER' },
  { id: 'u-rev-2', name: 'Ravi Reviewer', email: 'ravi.reviewer@portal.test', role: 'REVIEWER' },
  { id: 'u-admin-1', name: 'Asha Admin', email: 'asha.admin@portal.test', role: 'ADMIN' },
];

export interface StoredApplication {
  id: string;
  reference: string;
  status: ApplicationStatus;
  createdById: string;
  assignedReviewerId: string | null;
  riskLevel: RiskLevel | null;
  updatedAt: string;
  version: number;
  data: Omit<ApplicationPayload, 'banking'> & {
    banking: { bankName: string; accountHolder: string; swiftCode: string };
  };
  /** Kept apart from `data` so it can never leak through a generic serializer. */
  secrets: { accountNumber: string | null; taxId: string | null };
  riskHistory: RiskEvent[];
}

/** Small deterministic PRNG so the seed is identical on every load and in tests. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX = [
  'Himal',
  'Everest',
  'Lotus',
  'Summit',
  'River',
  'Bluebird',
  'Cedar',
  'Maple',
  'Kite',
  'Orchid',
  'Granite',
  'Pebble',
];
const SUFFIX = [
  'Coffee House',
  'Trekking Gear',
  'Books',
  'Tailors',
  'Bakery',
  'Electronics',
  'Pharmacy Supplies',
  'Crafts',
  'Florists',
  'Furniture',
];
const CATEGORIES = [
  'Retail',
  'Food & Beverage',
  'Travel',
  'Services',
  'Education',
  'Health & Beauty',
];
const TYPES: BusinessType[] = [
  'SOLE_PROPRIETOR',
  'PARTNERSHIP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'NON_PROFIT',
];
const CITIES = ['Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur', 'Biratnagar'];
const STATUSES: ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'IN_REVIEW',
  'INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
];
const RISK: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export function seedApplications(count = 48): StoredApplication[] {
  const rnd = mulberry32(42);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
  const sales = DEMO_USERS.filter((u) => u.role === 'SALES');
  const reviewers = DEMO_USERS.filter((u) => u.role === 'REVIEWER');
  const base = Date.UTC(2026, 9, 1);

  return Array.from({ length: count }, (_, i) => {
    const owner = pick(sales);
    const status = pick(STATUSES);
    const needsReviewer =
      status === 'IN_REVIEW' ||
      status === 'INFO_REQUESTED' ||
      status === 'APPROVED' ||
      status === 'REJECTED';
    const reviewer = needsReviewer ? pick(reviewers) : null;
    const decided = status === 'APPROVED' || status === 'REJECTED' || status === 'INFO_REQUESTED';
    const riskLevel = decided ? pick(RISK) : null;
    const legalName = `${pick(PREFIX)} ${pick(SUFFIX)} Pvt. Ltd.`;
    const created = new Date(base + i * 3_600_000 * 11).toISOString();
    const updated = new Date(base + i * 3_600_000 * 11 + 7_200_000).toISOString();
    const id = `app-${String(i + 1).padStart(4, '0')}`;
    const avg = 500 + Math.floor(rnd() * 4500);

    const history: RiskEvent[] = [
      { id: `${id}-e1`, at: created, actorName: owner.name, actorRole: 'SALES', type: 'CREATED' },
    ];
    if (status !== 'DRAFT')
      history.push({
        id: `${id}-e2`,
        at: created,
        actorName: owner.name,
        actorRole: 'SALES',
        type: 'SUBMITTED',
      });
    if (reviewer)
      history.push({
        id: `${id}-e3`,
        at: updated,
        actorName: 'Asha Admin',
        actorRole: 'ADMIN',
        type: 'ASSIGNED',
        note: `Assigned to ${reviewer.name}`,
      });
    if (decided && reviewer) {
      history.push({
        id: `${id}-e4`,
        at: updated,
        actorName: reviewer.name,
        actorRole: 'REVIEWER',
        type: 'DECISION',
        decision:
          status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'REQUEST_INFO',
        riskLevel: riskLevel!,
        note:
          status === 'APPROVED'
            ? 'Volumes consistent with category.'
            : 'Documentation incomplete for stated volume.',
      });
    }

    return {
      id,
      reference: `MA-${2026}${String(1000 + i)}`,
      status,
      createdById: owner.id,
      assignedReviewerId: reviewer?.id ?? null,
      riskLevel,
      updatedAt: updated,
      version: 1,
      data: {
        business: {
          legalName,
          tradingName: legalName.replace(' Pvt. Ltd.', ''),
          businessType: pick(TYPES),
          registrationNumber: `REG-${digits(6)}`,
          website: `https://${legalName.split(' ')[0].toLowerCase()}-${i}.example`,
          category: pick(CATEGORIES),
        },
        contact: {
          contactName: `Contact Person ${i + 1}`,
          email: `owner${i + 1}@merchant.test`,
          phone: `+97798${digits(8)}`,
          addressLine: `${10 + i} Example Marg`,
          city: pick(CITIES),
          country: 'NP',
          postalCode: digits(5),
        },
        processing: {
          monthlyVolume: avg * 300,
          averageTicket: avg,
          maxTicket: avg * 4,
          statementDescriptor: legalName.slice(0, 18).toUpperCase(),
        },
        banking: {
          bankName: 'Example Commercial Bank',
          accountHolder: legalName,
          swiftCode: 'EXMPNPKA',
        },
      },
      secrets: { accountNumber: `0000${digits(10)}`, taxId: `TST${digits(6)}` },
      riskHistory: history,
    };
  });
}
