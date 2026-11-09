import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import { canEdit, hasPermission } from '../../../core/auth/permissions';
import {
  APPLICATION_STATUSES,
  ApplicationQuery,
  ApplicationStatus,
  ApplicationSummary,
  Page,
} from '../../../core/models/application';
import { Pagination } from '../../../shared/ui/pagination';
import { RiskLabel, STATUS_LABEL, StatusBadge } from '../../../shared/ui/status-badge';
import { initialLoadState, loadState } from '../../../shared/util/load-state';

const PAGE_SIZES = [10, 20, 50] as const;

/** URL is the source of truth for filters: shareable, survives reload, back button works. */
export function parseQuery(params: { get(name: string): string | null }): ApplicationQuery {
  const status = params.get('status') ?? '';
  const pageSize = Number(params.get('pageSize'));
  return {
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 10,
    search: params.get('search') ?? '',
    status: (APPLICATION_STATUSES as readonly string[]).includes(status)
      ? (status as ApplicationStatus)
      : '',
  };
}

@Component({
  selector: 'app-dashboard-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, StatusBadge, RiskLabel, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly api = inject(ApplicationsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly statuses = APPLICATION_STATUSES;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseQuery)), {
    initialValue: parseQuery(this.route.snapshot.queryParamMap),
  });

  private readonly retry$ = new Subject<void>();
  protected readonly state = toSignal(
    loadState(toObservable(this.query), this.retry$, (q) => this.api.list(q)),
    {
      initialValue: initialLoadState<Page<ApplicationSummary>>(),
    },
  );

  protected readonly page = computed(() => this.state().data);
  protected readonly user = this.auth.user;
  protected readonly canCreate = computed(() => hasPermission(this.user(), 'application:create'));
  protected readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  protected readonly heading = computed(() => {
    switch (this.user()?.role) {
      case 'SALES':
        return 'My applications';
      case 'REVIEWER':
        return 'Assigned to me';
      default:
        return 'All applications';
    }
  });
  protected readonly totalCount = computed(() =>
    Object.values(this.page()?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0),
  );

  protected readonly searchControl = new FormControl(this.query().search, { nonNullable: true });

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        map((v) => v.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((search) => this.setQuery({ search, page: 1 }));
  }

  protected setQuery(patch: Partial<ApplicationQuery>): void {
    const next = { ...this.query(), ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: next.page > 1 ? next.page : null,
        pageSize: next.pageSize !== 10 ? next.pageSize : null,
        search: next.search || null,
        status: next.status || null,
      },
    });
  }

  protected onStatusChange(e: Event): void {
    this.setQuery({
      status: (e.target as HTMLSelectElement).value as ApplicationStatus | '',
      page: 1,
    });
  }

  protected onPageSizeChange(e: Event): void {
    this.setQuery({ pageSize: Number((e.target as HTMLSelectElement).value), page: 1 });
  }

  protected retry(): void {
    this.retry$.next();
  }

  protected clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.setQuery({ search: '', status: '', page: 1 });
  }

  protected canEdit(app: ApplicationSummary): boolean {
    return canEdit(this.user(), app);
  }
}
