import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import { canAssign, canEdit, canReveal, canReview } from '../../../core/auth/permissions';
import { ApplicationDetail } from '../../../core/models/application';
import { MaskedValue } from '../../../shared/ui/masked-value';
import { RiskLabel, StatusBadge } from '../../../shared/ui/status-badge';
import { initialLoadState, loadState } from '../../../shared/util/load-state';
import { BUSINESS_TYPES } from '../wizard/application-form';
import { AssignPanel } from './assign-panel';
import { ReviewPanel } from './review-panel';

@Component({
  selector: 'app-detail-page',
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    StatusBadge,
    RiskLabel,
    MaskedValue,
    ReviewPanel,
    AssignPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail.page.html',
  styleUrl: './detail.page.scss',
})
export class DetailPage {
  private readonly api = inject(ApplicationsApi);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  private readonly retry$ = new Subject<void>();

  protected readonly state = toSignal(
    loadState(toObservable(this.id), this.retry$, (id) => this.api.get(id)),
    {
      initialValue: initialLoadState<ApplicationDetail>(),
    },
  );
  /** Follows the loaded data, but review/assign can write the server's response straight in (no refetch). */
  protected readonly app = linkedSignal(() => this.state().data);

  protected readonly flash = signal<string | null>(
    (inject(Router).getCurrentNavigation()?.extras.state?.['flash'] as string) ?? null,
  );

  // Permission checks (UI side). The API re-checks every one of these.
  protected readonly user = this.auth.user;
  protected readonly canEdit = computed(() => !!this.app() && canEdit(this.user(), this.app()!));
  protected readonly canReview = computed(
    () => !!this.app() && canReview(this.user(), this.app()!),
  );
  protected readonly canAssign = computed(
    () => !!this.app() && canAssign(this.user(), this.app()!),
  );
  protected readonly canReveal = computed(
    () => !!this.app() && canReveal(this.user(), this.app()!),
  );
  protected readonly isSales = computed(() => this.user()?.role === 'SALES');

  protected businessTypeLabel(v: string): string {
    return BUSINESS_TYPES.find((t) => t.value === v)?.label ?? '—';
  }

  protected retry(): void {
    this.retry$.next();
  }

  protected onUpdated(d: ApplicationDetail, message: string): void {
    this.app.set(d);
    this.flash.set(message);
  }
}
