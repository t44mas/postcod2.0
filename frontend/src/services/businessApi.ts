import { parseConnection } from '../features/business/connection.ts';
import type { DemoConnection } from '../features/business/connection';
import type { Employee } from '../features/business/employees';
import type { BenefitGrant, BenefitUsage, BenefitCode } from '../features/business/benefits';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export class BusinessApi {
  private token = '';
  private baseUrl: string;
  private persona: 'demo_admin' | 'demo_other_admin';
  private tokenKey = 'pochta-premium:api-session:v1';
  constructor(baseUrl = '/api/v1', persona: 'demo_admin' | 'demo_other_admin' = 'demo_admin') {
    this.baseUrl = baseUrl; this.persona = persona;
    this.tokenKey += ':' + persona;
    try { this.token = sessionStorage.getItem(this.tokenKey) ?? ''; } catch { /* Session can stay in memory. */ }
  }
  private async login() {
    const result = await this.send<{ accessToken: string }>('/auth/demo/login', 'POST', { persona: this.persona }, '');
    this.token = result.accessToken;
    try { sessionStorage.setItem(this.tokenKey, this.token); } catch { /* No persistence required for a demo token. */ }
  }
  private async send<T>(path: string, method = 'GET', body?: unknown, token = this.token): Promise<T> {
    let response;
    try {
      response = await fetch(this.baseUrl + path, {
        method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new Error('API недоступно. Проверьте запуск backend и PostgreSQL.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, data?.code ?? 'api_error', data?.message ?? 'Ошибка API. Проверьте запуск backend.');
    return data as T;
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.token) await this.login();
    try { return await this.send<T>(path, method, body); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await this.login();
      return this.send<T>(path, method, body);
    }
  }
  async state(): Promise<DemoConnection | null> {
    try {
      const data = await this.request<unknown>('/companies/me/state');
      const state = parseConnection(JSON.stringify(data));
      if (!state) throw new Error('Ответ API не соответствует модели кабинета.');
      return state;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'company_not_found') return null;
      throw error;
    }
  }
  async connect(name: string, tariffId: string) { await this.request('/business/connect', 'POST', { name, tariffId }); }
  async pay(invoiceId: string) { await this.request(`/invoices/${encodeURIComponent(invoiceId)}/pay-demo`, 'POST'); }
  async addEmployee(name: string, role: Employee['role']) { await this.request('/companies/me/employees', 'POST', { name, role }); }
  async updateEmployee(id: string, change: Partial<Pick<Employee, 'role' | 'status'>>) { await this.request(`/companies/me/employees/${encodeURIComponent(id)}`, 'PATCH', change); }
  async grant(grant: BenefitGrant) { await this.request('/companies/me/limits', 'PATCH', grant); }
  async activate(employeeId: string, input: { code: BenefitCode; originalKopecks: number; requestKey: string }) {
    // The owner explicitly enters a limited demo employee session. The server
    // derives membership/company from this token, not from a client role/id.
    const session = await this.request<{ accessToken: string }>(`/auth/demo/employees/${encodeURIComponent(employeeId)}`, 'POST');
    return this.send<BenefitUsage>('/benefit-usages', 'POST', input, session.accessToken);
  }
  async reset(companyId: string) { await this.request('/demo/reset', 'POST', { companyId }); }
}
