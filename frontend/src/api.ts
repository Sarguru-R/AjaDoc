export interface User {
  id: string;
  name: string;
  email: string;
}

export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface DocumentSummary {
  id: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner: User;
  updatedBy: User | null;
  role: Role;
  shareCount?: number;
  /** Start of the content (sanitized HTML), for thumbnails. */
  preview?: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  commenter: 'Can comment',
  viewer: 'Can view',
};
export const canEdit = (role: Role) => role === 'owner' || role === 'editor';
export const canComment = (role: Role) => role !== 'viewer';

export interface VersionEntry {
  id: string;
  version: number;
  title: string;
  label: string | null;
  author: User | null;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  body: string;
  quote: string | null;
  author: User | null;
  resolved: boolean;
  resolvedBy: User | null;
  createdAt: string;
}

export interface PresenceInfo {
  active: { user: User; editing: boolean }[];
  version: number;
  updatedAt?: string;
  updatedBy?: User | null;
}

export interface PageSetup {
  size: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  /** Millimetres. */
  margins: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
};

export interface DocumentFull extends DocumentSummary {
  pageSetup: PageSetup;
  content: string;
}

export interface Share {
  user: User;
  role: ShareRole;
}

export interface SharingInfo {
  owner: User;
  shares: Share[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** All requests go to the API gateway, which runs on its own port / host. */
const API_URL = (import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`).replace(/\/$/, '');
const TOKEN_KEY = 'ajadoc-token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Called when the gateway rejects the token (expired or invalid), so the app can return to sign-in. */
let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  // Reads are retried briefly on a dropped connection (e.g. a service restarting); writes are not,
  // so nothing is ever applied twice.
  const attempts = method === 'GET' ? 3 : 1;
  let res: Response | undefined;
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await fetch(`${API_URL}/api${path}`, init);
    } catch {
      if (attempt >= attempts) {
        throw new ApiError(0, 'network_error', 'Cannot reach the AjaDoc server. Check that it is running, then retry.');
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  if (!res) throw new ApiError(0, 'network_error', 'Cannot reach the AjaDoc server.');
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? `Request failed (${res.status}).`);
    if (res.status === 401 && token) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw error;
  }
  return data as T;
}

export type ExportFormat = 'docx' | 'md' | 'html' | 'txt';

/** Downloads a document file to the user's computer. Uses fetch (not a plain link) so the auth header is sent. */
async function downloadDocument(id: string, format: ExportFormat, fallbackTitle: string): Promise<void> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/documents/${id}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && token) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? `Download failed (${res.status}).`);
  }

  // Prefer the server's filename (RFC 5987 UTF-8 form first).
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const ascii = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const filename = (utf8 && decodeURIComponent(utf8)) || ascii || `${fallbackTitle || 'document'}.${format}`;

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  downloadDocument,
  me: () => request<{ user: User }>('GET', '/auth/me'),
  login: async (email: string, password: string) => {
    const { user, token } = await request<{ user: User; token: string }>('POST', '/auth/login', { email, password });
    tokenStore.set(token);
    return { user };
  },
  signup: async (name: string, email: string, password: string) => {
    const { user, token } = await request<{ user: User; token: string }>('POST', '/auth/signup', { name, email, password });
    tokenStore.set(token);
    return { user };
  },
  logout: () => tokenStore.clear(),
  users: () => request<{ users: User[] }>('GET', '/users'),

  listDocuments: () => request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>('GET', '/documents'),
  createDocument: (title?: string, content?: string, template?: string) =>
    request<{ document: DocumentFull }>('POST', '/documents', { title, content, template }),
  importDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ document: DocumentFull }>('POST', '/documents/import', form);
  },
  getDocument: (id: string) => request<{ document: DocumentFull }>('GET', `/documents/${id}`),
  updateDocument: (id: string, changes: { title?: string; content?: string; pageSetup?: PageSetup; baseVersion: number }) =>
    request<{ document: DocumentSummary }>('PATCH', `/documents/${id}`, changes),
  deleteDocument: (id: string) => request<void>('DELETE', `/documents/${id}`),

  getShares: (id: string) => request<SharingInfo>('GET', `/documents/${id}/shares`),
  share: (id: string, email: string, role: ShareRole) => request<SharingInfo>('PUT', `/documents/${id}/shares`, { email, role }),

  versions: (id: string) => request<{ versions: VersionEntry[] }>('GET', `/documents/${id}/versions`),
  version: (id: string, versionId: string) =>
    request<{ version: VersionEntry & { content: string } }>('GET', `/documents/${id}/versions/${versionId}`),
  restoreVersion: (id: string, versionId: string, baseVersion: number) =>
    request<{ document: DocumentFull }>('POST', `/documents/${id}/versions/${versionId}/restore`, { baseVersion }),

  comments: (id: string) => request<{ comments: Comment[] }>('GET', `/documents/${id}/comments`),
  addComment: (id: string, body: string, quote: string | null) =>
    request<{ comments: Comment[] }>('POST', `/documents/${id}/comments`, { body, quote }),
  resolveComment: (id: string, commentId: string, resolved: boolean) =>
    request<{ comments: Comment[] }>('PATCH', `/documents/${id}/comments/${commentId}`, { resolved }),
  deleteComment: (id: string, commentId: string) => request<{ comments: Comment[] }>('DELETE', `/documents/${id}/comments/${commentId}`),

  presence: (id: string, editing: boolean) => request<PresenceInfo>('POST', `/documents/${id}/presence`, { editing }),
  leave: (id: string) => {
    // Best effort when the editor closes; keepalive lets it finish during page unload.
    const token = tokenStore.get();
    void fetch(`${API_URL}/api/documents/${id}/presence`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ leaving: true }),
    }).catch(() => undefined);
  },
  unshare: (id: string, userId: string) => request<SharingInfo>('DELETE', `/documents/${id}/shares/${userId}`),
};

export const IMPORT_ACCEPT = '.txt,.md,.docx';
export const IMPORT_HINT = 'Supported: .txt, .md, .docx (max 2 MB)';
