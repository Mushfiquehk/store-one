const BASE = "/api";

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  products: {
    list: () => request<any[]>("/products"),
    create: (data: any) => request<any>("/products", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/products/${id}`, { method: "DELETE" }),
  },
  variants: {
    list: (productId?: string) => request<any[]>(`/variants${productId ? `?productId=${productId}` : ""}`),
    create: (data: any) => request<any>("/variants", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/variants/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/variants/${id}`, { method: "DELETE" }),
  },
  modifierGroups: {
    list: () => request<any[]>("/modifier-groups"),
    create: (data: any) => request<any>("/modifier-groups", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/modifier-groups/${id}`, { method: "DELETE" }),
  },
  modifiers: {
    list: (groupId?: string) => request<any[]>(`/modifiers${groupId ? `?groupId=${groupId}` : ""}`),
    create: (data: any) => request<any>("/modifiers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/modifiers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/modifiers/${id}`, { method: "DELETE" }),
  },
  inventory: {
    list: () => request<any[]>("/inventory"),
    create: (data: any) => request<any>("/inventory", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    adjust: (id: string, delta: number) => request<any>(`/inventory/${id}/adjust`, { method: "POST", body: JSON.stringify({ delta }) }),
    delete: (id: string) => request<void>(`/inventory/${id}`, { method: "DELETE" }),
  },
  bom: {
    list: (sourceType?: string, sourceId?: string) => {
      const params = new URLSearchParams();
      if (sourceType) params.set("sourceType", sourceType);
      if (sourceId) params.set("sourceId", sourceId);
      const qs = params.toString();
      return request<any[]>(`/bom${qs ? `?${qs}` : ""}`);
    },
    create: (data: any) => request<any>("/bom", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/bom/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/bom/${id}`, { method: "DELETE" }),
  },
  employees: {
    list: () => request<any[]>("/employees"),
    create: (data: any) => request<any>("/employees", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/employees/${id}`, { method: "DELETE" }),
  },
  timePunches: {
    list: (employeeId?: string) => request<any[]>(`/time-punches${employeeId ? `?employeeId=${employeeId}` : ""}`),
    create: (data: any) => request<any>("/time-punches", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/time-punches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  sales: {
    list: () => request<any[]>("/sales"),
    create: (data: any) => request<any>("/sales", { method: "POST", body: JSON.stringify(data) }),
  },
};
