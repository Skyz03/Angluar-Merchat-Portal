import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ApplicationStatus, RiskLevel } from '../../core/models/application';

const STATUS_CLASS: Record<ApplicationStatus, string> = {
  DRAFT: 'text-bg-secondary',
  SUBMITTED: 'text-bg-info',
  IN_REVIEW: 'text-bg-primary',
  INFO_REQUESTED: 'text-bg-warning',
  APPROVED: 'text-bg-success',
  REJECTED: 'text-bg-danger',
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  INFO_REQUESTED: 'Info requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge rounded-pill" [class]="cls()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<ApplicationStatus>();
  protected readonly cls = computed(() => STATUS_CLASS[this.status()]);
  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
}

const RISK_CLASS: Record<RiskLevel, string> = {
  LOW: 'text-success',
  MEDIUM: 'text-warning-emphasis',
  HIGH: 'text-danger',
};

@Component({
  selector: 'app-risk-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (level(); as l) {
      <span class="fw-semibold" [class]="cls()">{{ l }}</span>
    } @else {
      <span class="text-body-secondary">—</span>
    }
  `,
})
export class RiskLabel {
  readonly level = input<RiskLevel | null>(null);
  protected readonly cls = computed(() => (this.level() ? RISK_CLASS[this.level()!] : ''));
}
