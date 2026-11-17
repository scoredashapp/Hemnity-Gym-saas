let csrfTokenCache = '';

export function setCsrfToken(token: string): void {
  csrfTokenCache = token;
}

export function getCsrfToken(): string {
  return csrfTokenCache;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfTokenCache && options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
    headers.set('X-CSRF-Token', csrfTokenCache);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      reject(new Error('Only JPG, PNG, and WEBP images are permitted.'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image file must be smaller than 2 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });
}
