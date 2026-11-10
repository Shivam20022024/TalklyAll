export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token');
  }
  return null;
}

export function setAuthToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
}

export function removeAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
  }
}

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function fetchApi(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = true, headers, ...customConfig } = options;
  const token = getAuthToken();

  const isFormData = typeof FormData !== 'undefined' && customConfig.body instanceof FormData;

  const reqHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string>),
  };

  if (requireAuth && token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...customConfig,
    headers: reqHeaders,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if ((response.status === 401 || response.status === 403) && requireAuth) {
    removeAuthToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errDetail = typeof data.detail === 'string'
      ? data.detail
      : Array.isArray(data.detail)
        ? data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
        : (typeof data.detail === 'object' && data.detail !== null)
          ? JSON.stringify(data.detail)
          : data.message || 'An error occurred';
    throw new Error(errDetail);
  }

  return data;
}

// For endpoints that return a binary file (e.g. .xlsx export) rather than JSON.
export async function fetchBlob(endpoint: string, options: FetchOptions = {}): Promise<Blob> {
  const { requireAuth = true, headers, ...customConfig } = options;
  const token = getAuthToken();

  const config: RequestInit = {
    ...customConfig,
    headers: { ...headers },
  };

  if (requireAuth && token) {
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if ((response.status === 401 || response.status === 403) && requireAuth) {
    removeAuthToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    let message = 'Failed to download file';
    try {
      const data = await response.json();
      message = data.detail || data.message || message;
    } catch {}
    throw new Error(message);
  }

  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
