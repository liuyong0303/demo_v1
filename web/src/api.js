import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 10000 });

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

export const categoriesApi = {
  list: () => http.get('/books/categories').then((r) => r.data.list),
};

export const booksApi = {
  list: (params) =>
    http.get('/books', { params }).then((r) => r.data).catch((e) => { throw normalizeError(e); }),
  get: (id) =>
    http.get(`/books/${id}`).then((r) => r.data).catch((e) => { throw normalizeError(e); }),
  create: (payload) =>
    http.post('/books', payload).then((r) => r.data).catch((e) => { throw normalizeError(e); }),
  update: (id, payload) =>
    http.put(`/books/${id}`, payload).then((r) => r.data).catch((e) => { throw normalizeError(e); }),
  remove: (id) =>
    http.delete(`/books/${id}`).then((r) => r.data).catch((e) => { throw normalizeError(e); }),
};
