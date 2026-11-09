export type ApplicationStatus =
  'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'INFO_REQUESTED' | 'APPROVED' | 'REJECTED';

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
];

export type BusinessType =
  'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'PRIVATE_LIMITED' | 'PUBLIC_LIMITED' | 'NON_PROFIT';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

/** Fields that are never sent in clear text unless explicitly revealed. */
export type SensitiveField = 'accountNumber' | 'taxId';
export const SENSITIVE_FIELDS: readonly SensitiveField[] = ['accountNumber', 'taxId'];

export interface BusinessInfo {
  legalName: string;
  tradingName: string;
  businessType: BusinessType | '';
  registrationNumber: string;
  website: string;
  category: string;
}

export interface ContactInfo {
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  postalCode: string;
}

export interface ProcessingInfo {
  monthlyVolume: number | null;
  averageTicket: number | null;
  maxTicket: number | null;
  statementDescriptor: string;
}

/** Banking as the client SENDS it (plain values only when the user typed new ones). */
export interface BankingInput {
  bankName: string;
  accountHolder: string;
  swiftCode: string;
  /** null/'' = keep the value already stored on the server. */
  accountNumber: string | null;
  taxId: string | null;
}

/** Banking as the server RETURNS it: sensitive fields are always masked. */
export interface BankingView {
  bankName: string;
  accountHolder: string;
  swiftCode: string;
  accountNumberMasked: string | null;
  taxIdMasked: string | null;
}

export interface ApplicationPayload {
  business: BusinessInfo;
  contact: ContactInfo;
  processing: ProcessingInfo;
  banking: BankingInput;
}

export interface RiskEvent {
  id: string;
  at: string;
  actorName: string;
  actorRole: string;
  type: 'CREATED' | 'SUBMITTED' | 'ASSIGNED' | 'DECISION' | 'REVEAL' | 'RESUBMITTED';
  decision?: ReviewDecision;
  riskLevel?: RiskLevel;
  note?: string;
}

export interface ApplicationSummary {
  id: string;
  reference: string;
  legalName: string;
  status: ApplicationStatus;
  createdById: string;
  createdByName: string;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  riskLevel: RiskLevel | null;
  updatedAt: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  business: BusinessInfo;
  contact: ContactInfo;
  processing: ProcessingInfo;
  banking: BankingView;
  riskHistory: RiskEvent[];
  version: number;
}

export interface ApplicationQuery {
  page: number;
  pageSize: number;
  search: string;
  status: ApplicationStatus | '';
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Optional dashboard counts, scoped to what the caller may see. */
  counts?: Partial<Record<ApplicationStatus, number>>;
}

export interface ReviewRequest {
  decision: ReviewDecision;
  riskLevel: RiskLevel;
  note: string;
}

export interface RevealResponse {
  field: SensitiveField;
  value: string;
}
