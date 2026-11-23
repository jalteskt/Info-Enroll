export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    const error = new Error(
      data?.error || `Request failed (${response.status}). Please try again.`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
