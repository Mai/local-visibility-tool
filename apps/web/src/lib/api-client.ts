import {
  type CareType,
  type AuditResult,
  type AuditStep,
} from '@sensi/shared';

export interface HealthResponse {
  status: string;
  timestamp: string;
  missingApiKeys: Array<{
    key: string;
    label: string;
    affects: string;
    signupUrl: string;
  }>;
}

export interface AuditPayload {
  url: string;
  zipCode: string;
  careTypes?: CareType[];
  primaryCareType?: CareType | '';
}

export interface AuditPollResponse {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  steps?: AuditStep[];
  result?: AuditResult;
  error?: string;
}

/**
 * Returns the URL for downloading the audit PDF report
 */
export function auditPdfUrl(auditId: string): string {
  return `/api/audits/${auditId}/pdf`;
}

/**
 * Checks backend health and API key status
 */
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  const data = await response.json();
  return {
    status: data.status || 'ok',
    timestamp: data.timestamp || new Date().toISOString(),
    missingApiKeys: data.missingApiKeys || [],
  };
}

/**
 * Triggers a live audit run for any user-submitted website & ZIP
 */
export async function startAudit(payload: AuditPayload): Promise<{ auditId: string }> {
  const searchQuery = `${payload.url} ${payload.zipCode}`.trim();

  const response = await fetch('/api/audits/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      websiteUrl: payload.url,
      searchQuery: searchQuery,
      zipCode: payload.zipCode,
      careTypes: payload.careTypes,
      primaryCareType: payload.primaryCareType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || errorData.error || 'The audit service encountered an error.'
    );
  }

  const result = await response.json();

  const cleanDomain = payload.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base64Domain = typeof window !== 'undefined'
    ? btoa(cleanDomain).replace(/=/g, '').substring(0, 12)
    : Buffer.from(cleanDomain).toString('base64').substring(0, 12);

  const auditId = result.data?.auditId || `audit-${base64Domain}`;

  return { auditId };
}

/**
 * Fetches current polling progress or audit results
 */
export async function getAudit(auditId: string): Promise<AuditPollResponse> {
  const response = await fetch(`/api/audits/${auditId}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    return {
      status: 'completed',
      result: undefined,
    };
  }

  return response.json();
}