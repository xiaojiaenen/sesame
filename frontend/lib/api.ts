export const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("sesame_token") : null;
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

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || data.message || "请求失败");
  }

  return data;
};
