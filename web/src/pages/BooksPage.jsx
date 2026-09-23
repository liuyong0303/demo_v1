import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Input, Select, Table, Space, Popconfirm, Tag, Skeleton, App as AntdApp, Empty, Tooltip,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { booksApi } from '../api';
import { CATEGORY_OPTIONS, DEFAULT_PAGE_SIZE, PLACEHOLDER_COVER } from '../constants';
import BookFormModal from '../components/BookFormModal';
import BookDetailModal from '../components/BookDetailModal';

export default function BooksPage() {
  const { message, modal } = AntdApp.useApp();

  const [query, setQuery] = useState({ keyword: '', category: '' });
  const [keywordInput, setKeywordInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editingBook, setEditingBook] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, q = query) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: ps };
      if (q.keyword) params.keyword = q.keyword;
      if (q.category) params.category = q.category;
      const res = await booksApi.list(params);
      setData(res);
      // REQ-002.3: 软删除导致当前页为空且非第1页时，自动回退到上一页
      if (res.total > 0 && res.list.length === 0 && p > 1) {
        const prev = p - 1;
        setPage(prev);
        fetchList(prev, ps, q);
        return;
      }
      setPage(res.page);
      setPageSize(res.page_size);
    } catch (err) {
      message.error(err?.message || '网络异常，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, message]);

  useEffect(() => {
    fetchList(page, pageSize, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    const nextQuery = { keyword: keywordInput.trim(), category: query.category };
    setQuery(nextQuery);
    setPage(1);
    fetchList(1, pageSize, nextQuery);
  }

  function handleCategoryChange(v) {
    const nextQuery = { keyword: keywordInput.trim(), category: v || '' };
    setQuery(nextQuery);
    setPage(1);
    fetchList(1, pageSize, nextQuery);
  }

  function handleReset() {
    setKeywordInput('');
    const nextQuery = { keyword: '', category: '' };
    setQuery(nextQuery);
    setPage(1);
    fetchList(1, pageSize, nextQuery);
  }

  function openCreate() {
    setFormMode('create');
    setEditingBook(null);
    setFormOpen(true);
  }

  function openEdit(book) {
    setFormMode('edit');
    setEditingBook(book);
    setFormOpen(true);
  }

  function openDetail(bookId) {
    setDetailId(bookId);
    setDetailOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    setEditingBook(null);
    // 成功后刷新当前页（新建在倒序中出现在第1页附近，当前页刷新可保证一致；编辑直接更新当前页）
    fetchList(page, pageSize, query);
  }

  async function handleDelete(book) {
    setDeletingId(book.id);
    try {
      await booksApi.remove(book.id);
      message.success('删除成功');
      // 移除后本地更新，若当前页清空自动回退
      const newList = data.list.filter((b) => b.id !== book.id);
      let nextPage = page;
      if (newList.length === 0 && page > 1) nextPage = page - 1;
      fetchList(nextPage, pageSize, query);
    } catch (err) {
      message.error(err?.message || '删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
    }
  }

  const columns = [
    {
      title: '封面',
      dataIndex: 'cover_url',
      width: 72,
      render: (v) => (
        <img
          src={v || PLACEHOLDER_COVER}
          alt="封面"
          className="cover-thumb"
          onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
        />
      ),
    },
    {
      title: '书名',
      dataIndex: 'title',
      render: (v, row) => (
        <a onClick={() => openDetail(row.id)}>{v}</a>
      ),
    },
    { title: '作者', dataIndex: 'author' },
    { title: 'ISBN', dataIndex: 'isbn' },
    {
      title: '分类',
      dataIndex: 'category',
      width: 80,
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    { title: '库存', dataIndex: 'stock', width: 80 },
    {
      title: '价格',
      dataIndex: 'price',
      width: 100,
      render: (v) => `¥ ${Number(v).toFixed(2)}`,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(row.id)}>详情</Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>
          </Tooltip>
          <Popconfirm
            title="确认删除该书？"
            description={`删除后《${row.title}》将从图书列表中隐藏，不在相关页面展示。本版不提供恢复入口，是否继续？`}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deletingId === row.id }}
            onConfirm={() => handleDelete(row)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const hasFilter = !!query.keyword || !!query.category;
  const empty = data.total === 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>图书管理</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList(page, pageSize, query)}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增图书</Button>
        </Space>
      </div>

      <div className="filter-bar">
        <Input
          placeholder="按书名 / 作者 / ISBN 搜索"
          allowClear
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        />
        <Select
          placeholder="分类"
          allowClear
          style={{ width: 160 }}
          value={query.category || undefined}
          onChange={handleCategoryChange}
          options={CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))}
        />
        <Button type="primary" onClick={handleSearch}>查询</Button>
        <Button onClick={handleReset}>重置</Button>
      </div>

      <div className="table-card">
        {loading && data.list.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : empty ? (
          hasFilter ? (
            <Empty
              description="没有找到匹配的图书，请调整搜索条件"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={handleReset}>清空条件</Button>
            </Empty>
          ) : (
            <Empty
              description="暂无图书，点击右上角「新增图书」开始录入"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增图书</Button>
            </Empty>
          )
        ) : (
          <>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={data.list}
              pagination={false}
              scroll={{ x: 960 }}
            />
            <div className="pagination-wrap">
              <PaginationControl
                page={page}
                pageSize={pageSize}
                total={data.total}
                onChange={(p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                  fetchList(p, ps, query);
                }}
              />
            </div>
          </>
        )}
      </div>

      <BookFormModal
        open={formOpen}
        mode={formMode}
        initialBook={editingBook}
        parentMessage={message}
        onCancel={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <BookDetailModal
        open={detailOpen}
        bookId={detailId}
        onClose={() => setDetailOpen(false)}
        onEdit={(book) => { setDetailOpen(false); openEdit(book); }}
      />
    </div>
  );
}

import { Pagination as AntPagination } from 'antd';
function PaginationControl({ page, pageSize, total, onChange }) {
  return (
    <AntPagination
      current={page}
      pageSize={pageSize}
      total={total}
      showSizeChanger
      pageSizeOptions={[10, 20, 50]}
      showTotal={(t) => `共 ${t} 条`}
      onChange={onChange}
    />
  );
}
