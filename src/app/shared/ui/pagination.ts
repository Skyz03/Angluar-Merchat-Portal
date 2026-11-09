import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="label()">
      <ul class="pagination pagination-sm mb-0 flex-wrap">
        <li class="page-item" [class.disabled]="page() <= 1">
          <button
            type="button"
            class="page-link"
            (click)="go(page() - 1)"
            [disabled]="page() <= 1"
            aria-label="Previous page"
          >
            ‹
          </button>
        </li>
        @for (p of pages(); track $index) {
          @if (p === null) {
            <li class="page-item disabled"><span class="page-link">…</span></li>
          } @else {
            <li class="page-item" [class.active]="p === page()">
              <button
                type="button"
                class="page-link"
                (click)="go(p)"
                [attr.aria-current]="p === page() ? 'page' : null"
              >
                {{ p }}
              </button>
            </li>
          }
        }
        <li class="page-item" [class.disabled]="page() >= totalPages()">
          <button
            type="button"
            class="page-link"
            (click)="go(page() + 1)"
            [disabled]="page() >= totalPages()"
            aria-label="Next page"
          >
            ›
          </button>
        </li>
      </ul>
    </nav>
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly label = input('Pagination');
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );

  /** Compact window: 1 … 4 5 [6] 7 8 … 20 */
  protected readonly pages = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const cur = this.page();
    const set = new Set([1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | null)[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
      out.push(p);
    });
    return out;
  });

  go(p: number): void {
    if (p >= 1 && p <= this.totalPages() && p !== this.page()) this.pageChange.emit(p);
  }
}
