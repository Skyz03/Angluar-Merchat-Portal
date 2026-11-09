import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApplicationDetail,
  ApplicationPayload,
  ApplicationQuery,
  ApplicationSummary,
  Page,
  RevealResponse,
  ReviewRequest,
  SensitiveField,
} from '../models/application';
import { User } from '../models/user';
import { API_BASE_URL } from './api-base-url';

@Injectable({ providedIn: 'root' })
export class ApplicationsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/applications`;

  list(query: ApplicationQuery): Observable<Page<ApplicationSummary>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<Page<ApplicationSummary>>(this.base, { params });
  }

  get(id: string): Observable<ApplicationDetail> {
    return this.http.get<ApplicationDetail>(`${this.base}/${id}`);
  }

  createDraft(payload: ApplicationPayload): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(this.base, payload);
  }

  saveDraft(id: string, payload: ApplicationPayload): Observable<ApplicationDetail> {
    return this.http.put<ApplicationDetail>(`${this.base}/${id}`, payload);
  }

  submit(id: string, payload: ApplicationPayload): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(`${this.base}/${id}/submit`, payload);
  }

  review(id: string, body: ReviewRequest): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(`${this.base}/${id}/review`, body);
  }

  assign(id: string, reviewerId: string): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(`${this.base}/${id}/assign`, { reviewerId });
  }

  reveal(id: string, field: SensitiveField): Observable<RevealResponse> {
    return this.http.post<RevealResponse>(`${this.base}/${id}/reveal`, { field });
  }

  /** Async-validator helper: is this registration number already used by another application? */
  registrationTaken(
    registrationNumber: string,
    excludeId: string | null,
  ): Observable<{ taken: boolean }> {
    let params = new HttpParams().set('registrationNumber', registrationNumber);
    if (excludeId) params = params.set('excludeId', excludeId);
    return this.http.get<{ taken: boolean }>(`${this.base}/registration-check`, { params });
  }

  reviewers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base.replace('/applications', '')}/users/reviewers`);
  }
}
