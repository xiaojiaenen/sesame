const TOKEN_KEY = "sesame_token";

// 缓存 base URL（构建时常量，运行时不会变化）
let _baseUrl: string | null = null;
export const getBaseUrl = () => {
  if (_baseUrl !== null) return _baseUrl;
  _baseUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return _baseUrl;
};

export interface ApiError extends Error {
  status: number;
  detail: string;
}

export const apiFetch = async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ? Object.fromEntries(
      options.headers instanceof Headers
        ? options.headers.entries()
        : Array.isArray(options.headers)
          ? options.headers
          : Object.entries(options.headers)
    ) : {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${getBaseUrl()}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const err = new Error(data.detail || data.message || `请求失败 (${response.status})`) as ApiError;
    err.status = response.status;
    err.detail = data.detail || data.message || "";
    throw err;
  }

  // 处理空响应体（如 204 No Content）
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
};
