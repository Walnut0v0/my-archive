export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data: any = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/login")
      window.dispatchEvent(new Event("archive-locked"));
    throw new Error(data.error || "网络连接失败");
  }
  return data;
}
