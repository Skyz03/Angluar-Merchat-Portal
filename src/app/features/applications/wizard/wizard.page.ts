import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, filter, first, map, of, switchMap, tap } from 'rxjs';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { AuthService } from '../../../core/auth/auth.service';
import { canEdit } from '../../../core/auth/permissions';
import { ApplicationDetail, ApplicationPayload } from '../../../core/models/application';
import { FieldError } from '../../../shared/ui/field-error';
import { httpErrorMessage } from '../../../shared/util/load-state';
import {
  ApplicationForm,
  BUSINESS_TYPES,
  CATEGORIES,
  COUNTRIES,
  StepKey,
  buildApplicationForm,
  patchFromDetail,
  toLocalBackup,
  toPayload,
} from './application-form';
import { AutoSave } from './auto-save';
import { HasPendingChanges } from './pending-changes.guard';

interface Step {
  key: StepKey | 'review';
  label: string;
}

const STEPS: Step[] = [
  { key: 'business', label: 'Business' },
  { key: 'contact', label: 'Contact' },
  { key: 'processing', label: 'Processing' },
  { key: 'banking', label: 'Banking' },
  { key: 'review', label: 'Review' },
];

const BACKUP_PREFIX = 'mp.draft-backup.';

@Component({
  selector: 'app-wizard-page',
  imports: [ReactiveFormsModule, RouterLink, FieldError, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wizard.page.html',
  styleUrl: './wizard.page.scss',
})
export class WizardPage implements OnInit, HasPendingChanges {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ApplicationsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Route param (component input binding). Undefined on /applications/new. */
  readonly id = input<string>();

  protected readonly steps = STEPS;
  protected readonly businessTypes = BUSINESS_TYPES;
  protected readonly categories = CATEGORIES;
  protected readonly countries = COUNTRIES;

  readonly form: ApplicationForm = buildApplicationForm(this.fb, (reg) =>
    this.api.registrationTaken(reg, this.draftId()).pipe(map((r) => r.taken)),
  );

  /** Re-evaluates template helpers on ANY form event (needed for zoneless + async validators). */
  private readonly formTick = toSignal(this.form.events.pipe(map(() => ({}))), {
    initialValue: {},
  });

  protected readonly draftId = signal<string | null>(null);
  protected readonly detail = signal<ApplicationDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stepIndex = signal(0);
  protected readonly maxReached = signal(0);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly backupAvailable = signal<{ savedAt: string } | null>(null);
  protected readonly stepAnnouncement = signal('');

  protected readonly current = computed(() => this.steps[this.stepIndex()]);
  protected readonly isReview = computed(() => this.current().key === 'review');

  autoSave!: AutoSave<ApplicationPayload>;
  private submitted = false;

  ngOnInit(): void {
    const id = this.id();
    if (!id) {
      this.startAutoSave();
      this.checkBackup('new');
      return;
    }
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (d) => {
        if (!canEdit(this.auth.user(), d)) {
          // UI guard on top of the API's own 403: never render an editable form for a locked application.
          void this.router.navigate(['/applications', id], { replaceUrl: true });
          return;
        }
        this.detail.set(d);
        this.draftId.set(d.id);
        patchFromDetail(this.form, d);
        this.form.markAsPristine();
        this.loading.set(false);
        this.startAutoSave();
        this.autoSave.markSaved(toPayload(this.form));
        this.checkBackup(d.id);
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(httpErrorMessage(e));
      },
    });
  }

  // ------------------------------------------------------------- auto-save

  private startAutoSave(): void {
    this.autoSave = new AutoSave<ApplicationPayload>({
      changes$: this.form.valueChanges.pipe(
        filter(() => !this.submitting()),
        tap(() => this.writeBackup()),
      ),
      snapshot: () => toPayload(this.form),
      save: (payload) => this.persist(payload),
      debounceMs: 1500,
      destroyRef: this.destroyRef,
    });
  }

  /** First save creates the draft (POST); later saves update it (PUT). concatMap in AutoSave guarantees no double-create. */
  private persist(payload: ApplicationPayload): Observable<ApplicationDetail> {
    const id = this.draftId();
    if (id) return this.api.saveDraft(id, payload).pipe(tap((d) => this.afterSave(d)));
    return this.api.createDraft(payload).pipe(
      tap((d) => {
        this.draftId.set(d.id);
        // Move the "new" backup under the real id and make the URL reload-safe.
        this.clearBackup('new');
        this.location.replaceState(`/applications/${d.id}/edit`);
        this.afterSave(d);
      }),
    );
  }

  private afterSave(d: ApplicationDetail): void {
    this.detail.set(d);
    if (this.autoSave.status() !== 'error') this.clearBackup(d.id);
  }

  protected retrySave(): void {
    this.autoSave.saveNow();
  }

  hasPendingChanges(): boolean {
    return !this.submitted && !!this.autoSave && this.autoSave.hasUnsavedChanges;
  }

  // ------------------------------------------------- local backup (non-sensitive)

  private backupKey(id: string) {
    return BACKUP_PREFIX + id;
  }

  private writeBackup(): void {
    try {
      const key = this.backupKey(this.draftId() ?? 'new');
      localStorage.setItem(
        key,
        JSON.stringify({ savedAt: new Date().toISOString(), value: toLocalBackup(this.form) }),
      );
    } catch {
      /* storage full or blocked — server auto-save still runs */
    }
  }

  private clearBackup(id: string): void {
    try {
      localStorage.removeItem(this.backupKey(id));
    } catch {
      /* ignore */
    }
  }

  private checkBackup(id: string): void {
    try {
      const raw = localStorage.getItem(this.backupKey(id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt: string };
      const serverTime = this.detail()?.updatedAt;
      if (!serverTime || parsed.savedAt > serverTime)
        this.backupAvailable.set({ savedAt: parsed.savedAt });
      else this.clearBackup(id);
    } catch {
      /* ignore corrupt backup */
    }
  }

  protected restoreBackup(): void {
    try {
      const raw = localStorage.getItem(this.backupKey(this.draftId() ?? 'new'));
      if (raw) this.form.patchValue((JSON.parse(raw) as { value: object }).value); // emits → triggers auto-save
    } catch {
      /* ignore */
    }
    this.backupAvailable.set(null);
  }

  protected discardBackup(): void {
    this.clearBackup(this.draftId() ?? 'new');
    this.backupAvailable.set(null);
  }

  // ---------------------------------------------------------- navigation

  protected stepGroup(key: StepKey): FormGroup {
    return this.form.controls[key];
  }

  protected stepValid(i: number): boolean {
    this.formTick();
    const key = this.steps[i].key;
    return key === 'review' ? this.form.valid : this.form.controls[key].valid;
  }

  protected next(): void {
    const key = this.current().key;
    if (key === 'review') return;
    const group = this.form.controls[key];
    const go = () => {
      if (group.invalid) {
        group.markAllAsTouched();
        this.focusFirstInvalid();
        return;
      }
      this.goTo(this.stepIndex() + 1);
    };
    // Wait for in-flight async validators (registration check) instead of blocking or skipping them.
    if (group.pending) {
      group.statusChanges
        .pipe(
          filter((s) => s !== 'PENDING'),
          first(),
        )
        .subscribe(go);
    } else {
      go();
    }
  }

  protected back(): void {
    this.goTo(this.stepIndex() - 1);
  }

  /** Steps already reached are always clickable; future ones only through Next (which validates). */
  protected goTo(i: number): void {
    if (i < 0 || i >= this.steps.length || i > this.maxReached() + 1) return;
    if (i > this.stepIndex() && i > this.maxReached()) {
      // forward into a new step requires all previous steps valid
      for (let s = 0; s < i; s++) if (!this.stepValid(s)) return;
    }
    this.stepIndex.set(i);
    this.maxReached.update((m) => Math.max(m, i));
    this.stepAnnouncement.set(`Step ${i + 1} of ${this.steps.length}: ${this.steps[i].label}`);
    queueMicrotask(() =>
      this.host.nativeElement.querySelector<HTMLElement>('#step-heading')?.focus(),
    );
  }

  private focusFirstInvalid(): void {
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>(
        'form .ng-invalid:not(form):not(fieldset):not([formgroupname])',
      );
      el?.focus();
    });
  }

  // ------------------------------------------------------------- template helpers

  protected ctrl(path: string): AbstractControl {
    return this.form.get(path)!;
  }

  protected invalid(path: string): boolean {
    this.formTick();
    const c = this.form.get(path)!;
    return c.touched && c.invalid;
  }

  protected value(path: string): unknown {
    this.formTick();
    return this.form.get(path)?.value;
  }

  protected label<T extends { value?: string; code?: string }>(
    list: T[],
    v: unknown,
    key: 'label' | 'name',
  ): string {
    const hit = list.find((x) => (x.value ?? x.code) === v) as Record<string, string> | undefined;
    return hit?.[key] ?? '—';
  }

  // ------------------------------------------------------------- submit

  protected submit(): void {
    this.submitError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const firstBad = this.steps.findIndex((_, i) => !this.stepValid(i));
      if (firstBad >= 0 && firstBad !== this.stepIndex()) this.stepIndex.set(firstBad);
      this.focusFirstInvalid();
      return;
    }
    this.submitting.set(true);
    // Runs after any in-flight auto-save, so draftId is settled and nothing races the submit.
    this.autoSave
      .runExclusive(() => {
        const payload = toPayload(this.form);
        const id = this.draftId();
        const id$ = id ? of(id) : this.api.createDraft(payload).pipe(map((d) => d.id));
        return id$.pipe(
          tap((newId) => this.draftId.set(newId)),
          switchMap((newId) => this.api.submit(newId, payload)),
          tap(() => this.autoSave.markSaved(payload)),
        );
      })
      .subscribe({
        next: (d) => {
          this.submitted = true;
          this.clearBackup(d.id);
          this.clearBackup('new');
          void this.router.navigate(['/applications', d.id], {
            state: { flash: 'Application submitted for review.' },
          });
        },
        error: (e) => this.onSubmitError(e),
      });
  }

  /** Maps server-side 422 field errors back onto the right controls and step. */
  private onSubmitError(e: unknown): void {
    this.submitting.set(false);
    const errors =
      e instanceof HttpErrorResponse && e.status === 422
        ? (e.error?.errors as Record<string, string> | undefined)
        : undefined;
    if (errors) {
      for (const [path, code] of Object.entries(errors)) {
        const c = this.form.get(path);
        c?.setErrors({
          ...(c.errors ?? {}),
          [code === 'required' ? 'required' : 'server']:
            code === 'required' ? true : `Server: ${code}`,
        });
        c?.markAsTouched();
      }
      const firstStep = this.steps.findIndex((s) =>
        Object.keys(errors).some((p) => p.startsWith(s.key + '.')),
      );
      if (firstStep >= 0) this.stepIndex.set(firstStep);
      this.submitError.set('Please fix the highlighted fields.');
      this.focusFirstInvalid();
    } else {
      this.submitError.set(httpErrorMessage(e));
    }
  }
}
