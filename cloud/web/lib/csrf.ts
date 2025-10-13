/**
 * CSRF Token 工具模块
 */

// 内存中存储CSRF token（客户端状态）
let csrfToken: string | null = null;

/**
 * 获取CSRF token
 */
export async function getCsrfToken(): Promise<string | null> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const cookieStore = require('next/headers').cookies;
    const adminSession = cookieStore.get("admin_session");

    if (!adminSession?.value) {
      return null;
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const response = await fetch(`${backendUrl}/api/admin/csrf-token`, {
      method: "GET",
      headers: {
        cookie: `admin_session=${adminSession.value}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to get CSRF token:", response.status);
      return null;
    }

    const data = await response.json();
    csrfToken = data.csrf_token;
    return csrfToken;
  } catch (error) {
    console.error("Error getting CSRF token:", error);
    return null;
  }
}

/**
 * 重置CSRF token
 */
export function resetCsrfToken(): void {
  csrfToken = null;
}

/**
 * 为API请求添加CSRF token到headers
 */
export async function addCsrfToHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getCsrfToken();

  if (token) {
    headers["X-CSRF-Token"] = token;
  }

  return headers;
}

/**
 * 创建带有CSRF保护的安全fetch请求
 */
export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const secureOptions = { ...options };

  // 为非GET请求添加CSRF token
  if (!options.method || options.method.toUpperCase() !== "GET") {
    const headers = { ...(options.headers as Record<string, string>) || {} };
    await addCsrfToHeaders(headers);
    secureOptions.headers = headers;
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const fullUrl = url.startsWith("http") ? url : `${backendUrl}${url}`;

  return fetch(fullUrl, secureOptions);
}

/**
 * 创建带有认证和CSRF保护的安全API客户端
 */
export class SecureApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.BACKEND_URL || "http://localhost:8000";
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const cookieStore = require('next/headers').cookies;
    const adminSession = cookieStore.get("admin_session");
    const headers: Record<string, string> = {};

    if (adminSession?.value) {
      headers.cookie = `admin_session=${adminSession.value}`;
    }

    return headers;
  }

  async get(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...(options.headers as Record<string, string>) || {},
      ...(await this.getAuthHeaders()),
    };

    return secureFetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      method: "GET",
      headers,
    });
  }

  async post(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>) || {},
      ...(await this.getAuthHeaders()),
    };

    // 为POST请求添加CSRF token
    await addCsrfToHeaders(headers);

    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      method: "POST",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put(endpoint: string, data?: any, options: RequestInit = {}): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>) || {},
      ...(await this.getAuthHeaders()),
    };

    // 为PUT请求添加CSRF token
    await addCsrfToHeaders(headers);

    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      method: "PUT",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...(options.headers as Record<string, string>) || {},
      ...(await this.getAuthHeaders()),
    };

    // 为DELETE请求添加CSRF token
    await addCsrfToHeaders(headers);

    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      method: "DELETE",
      headers,
    });
  }

  async upload(endpoint: string, formData: FormData, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...(options.headers as Record<string, string>) || {},
      ...(await this.getAuthHeaders()),
    };

    // 为上传请求添加CSRF token
    await addCsrfToHeaders(headers);

    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      method: "POST",
      headers,
      body: formData,
    });
  }
}

// 默认API客户端实例
export const apiClient = new SecureApiClient();