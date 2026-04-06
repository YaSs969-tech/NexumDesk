import axios from 'axios';

// API configuration
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000/api/v1';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nexum_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Let the browser set multipart boundaries for FormData requests.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      delete (config.headers as any)['Content-Type'];
      delete (config.headers as any)['content-type'];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors uniformly
api.interceptors.response.use(
  (response) => response,
  (error: any) => {
    // Handle different error status codes
    if (error.response) {
      const { status, data } = error.response;
      
      // Extract error message
      let message = data?.error || data?.message || 'An error occurred';
      
      // Handle specific status codes
      switch (status) {
        case 400:
          message = message || 'Invalid request';
          break;
        case 401:
          message = 'Session expired. Please login again';
          localStorage.removeItem('nexum_token');
          localStorage.removeItem('nexum_user');
          break;
        case 403:
          message = message || 'Access denied';
          break;
        case 404:
          message = message || 'Resource not found';
          break;
        case 409:
          message = message || 'Conflict';
          break;
        case 500:
          message = 'Server error. Please try again later';
          break;
      }
      
      error.message = message;
      return Promise.reject(error);
    } else if (error.request) {
      error.message = 'Network error. Please check your connection';
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

export default api;

// Helper functions for common API calls
export const userApi = {
  list: () => api.get('/users'),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, password: string) => 
    api.post(`/users/${id}/reset-password`, { password }),
};

export const incidentApi = {
  list: (params?: any) => api.get('/incidents', { params }),
  get: (id: string) => api.get(`/incidents/${id}`),
  create: (data: any) => api.post('/incidents', data),
  update: (id: string, data: any) => api.put(`/incidents/${id}`, data),
  assign: (id: string, userId: string) => 
    api.post(`/incidents/${id}/assign`, { user_id: userId }),
};

export const authApi = {
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string; confirm_new_password: string }) =>
    api.put('/auth/change-password', data),
};

// Admin API
export const adminApi = {
  // Dashboard Stats
  getStats: () => api.get('/admin/stats'),
  
  // SLA Policies
  getSlaPolicies: () => api.get('/admin/sla-policies'),
  createSlaPolicy: (data: any) => api.post('/admin/sla-policies', data),
  updateSlaPolicy: (id: string, data: any) => api.put(`/admin/sla-policies/${id}`, data),
  deleteSlaPolicy: (id: string) => api.delete(`/admin/sla-policies/${id}`),
  
  // Categories
  getCategories: () => api.get('/admin/categories'),
  createCategory: (data: any) => api.post('/admin/categories', data),
  updateCategory: (id: string, data: any) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),
  getSubcategories: (params?: { category_id?: string }) => api.get('/admin/subcategories', { params }),
  createSubcategory: (data: any) => api.post('/admin/subcategories', data),
  updateSubcategory: (id: string, data: any) => api.put(`/admin/subcategories/${id}`, data),
  deleteSubcategory: (id: string) => api.delete(`/admin/subcategories/${id}`),
  toggleSubcategoryStatus: (id: string) => api.patch(`/admin/subcategories/${id}/toggle-status`),
  
  // System Settings
  getSettings: (category?: string) => api.get('/admin/settings', { params: category ? { category } : {} }),
  updateSetting: (key: string, value: string) => api.put(`/admin/settings/${encodeURIComponent(key)}`, { value }),
  bulkUpdateSettings: (settings: { key: string; value: string }[]) => api.put('/admin/settings', { settings }),
  
  // Business Hours
  getBusinessHours: () => api.get('/admin/business-hours'),
  createBusinessHours: (data: any) => api.post('/admin/business-hours', data),
  updateBusinessHours: (data: any) => api.put('/admin/business-hours', data),
  deleteBusinessHours: (id: string) => api.delete(`/admin/business-hours/${id}`),
  
  // Audit Logs
  getAuditLogs: (params?: any) => api.get('/admin/audit-logs', { params }),
  
  // Roles & Permissions
  getRoles: () => api.get('/admin/roles'),
};
