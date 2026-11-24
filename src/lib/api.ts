const BASE = '/api';

async function request(url: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const fetchServices = () => request('/services');
export const getActiveOrders = () => request('/orders');
export const getOrder = (id: number) => request(`/orders/${id}`);
export const getAdminStats = () => request('/admin/stats');
export const setSalonMode = (mode: 'auto' | 'open' | 'closed') =>
  request('/admin/salon/status', { method: 'PATCH', body: JSON.stringify({ mode }) });
export const getAdminSession = () => request('/admin/session');
export const adminLogin = (password: string) => request('/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
export const adminLogout = () => request('/admin/logout', { method: 'POST' });

export const createOrder = (data: {
  customer_name: string;
  customer_phone: string;
  items: Array<{ service_id: number; quantity: number }>;
}) => request('/orders', { method: 'POST', body: JSON.stringify(data) });

export const updateOrderStatus = (id: number, status: string) =>
  request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const cancelOrder = (id: number, cancelToken: string) =>
  request(`/orders/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ cancel_token: cancelToken }) });

export const createService = (data: Record<string, unknown>) =>
  request('/services', { method: 'POST', body: JSON.stringify(data) });

export const updateService = (id: number, data: Record<string, unknown>) =>
  request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteService = (id: number) =>
  request(`/services/${id}`, { method: 'DELETE' });
