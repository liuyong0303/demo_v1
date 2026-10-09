import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 10000 });

// Read current user from localStorage on each request (auth is stored there).
http.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('demo_v1.auth');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.id && u.kind) {
        config.headers['X-User-Id'] = String(u.id);
        config.headers['X-User-Role'] = u.kind;
      }
    }
  } catch (_) {}
  return config;
});

function normalizeError(err) {
  const data = err?.response?.data;
  const status = err?.response?.status;
  if (data && typeof data === 'object') {
    return {
      status,
      code: data.code,
      message: data.message || '请求失败',
      errors: data.errors || null,
      field: data.field || null,
      raw: data,
    };
  }
  return { status, code: 'NetworkError', message: '网络异常，请检查网络后重试', errors: null, raw: err };
}

function wrap(promise) {
  return promise.then((r) => r.data).catch((e) => { throw normalizeError(e); });
}

export const categoriesApi = {
  list: () => wrap(http.get('/books/categories')),
};

export const booksApi = {
  list: (params) => wrap(http.get('/books', { params })),
  get: (id) => wrap(http.get(`/books/${id}`)),
  create: (payload) => wrap(http.post('/books', payload)),
  update: (id, payload) => wrap(http.put(`/books/${id}`, payload)),
  remove: (id) => wrap(http.delete(`/books/${id}`)),
  reservationInfo: (id) => wrap(http.get(`/books/${id}/reservation`)),
};

export const authApi = {
  users: () => wrap(http.get('/auth/users')),
};

export const reservationsApi = {
  create: (bookId) => wrap(http.post('/reservations', { book_id: bookId })),
  listMine: (params = {}) => wrap(http.get('/reservations/me', { params })),
  cancelMine: (id) => wrap(http.post(`/reservations/${id}/cancel`)),
  listAdmin: (params = {}) => wrap(http.get('/admin/reservations', { params })),
  getAdmin: (id) => wrap(http.get(`/admin/reservations/${id}`)),
  adminCancel: (id, reason) => wrap(http.post(`/admin/reservations/${id}/cancel`, { reason })),
  adminAddNote: (id, content) => wrap(http.post(`/admin/reservations/${id}/notes`, { content })),
};

export const messagesApi = {
  listMine: (params = {}) => wrap(http.get('/messages/me', { params })),
  markRead: (id) => wrap(http.post(`/messages/${id}/read`)),
  markAllRead: () => wrap(http.post('/messages/read_all')),
};

export const loansApi = {
  loan: (bookId) => wrap(http.post('/loans/loan', { book_id: bookId })),
  returnByBook: (bookId) => wrap(http.post('/loans/return', { book_id: bookId })),
  returnByLoan: (loanId) => wrap(http.post('/loans/return', { loan_id: loanId })),
  myLoans: (params = {}) => wrap(http.get('/loans/me', { params })),
};
