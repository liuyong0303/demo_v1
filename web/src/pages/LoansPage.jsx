import React, { useCallback, useEffect, useState } from 'react';
import { Button, Tabs, Table, Space, App as AntdApp, Skeleton, Tag, Empty, Input, Select } from 'antd';
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { loansApi, booksApi } from '../api';
import { CATEGORY_OPTIONS, DEFAULT_PAGE_SIZE, PLACEHOLDER_COVER } from '../constants';

const { TabPane } = Tabs;

export default function LoansPage() {
  const { message } = AntdApp.useApp();
  const [tab, setTab] = useState('mine');
  return (
    <div>
      <div className="page-header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>我的借阅</div>
      </div>
      <div className="table-card">
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'mine', label: '借阅记录', children: <MyLoansPane /> },
          { key: 'browse', label: '去借书/还书', children: <BrowseBooksPane /> },
        ]} />
      </div>
    </div>
  );
}

function MyLoansPane() {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [returningId, setReturningId] = useState(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loansApi.myLoans();
      setItems(res.items || []);
    } catch (err) {
      message.error(err?.message || '获取借阅记录失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function handleReturn(row) {
    setReturningId(row.id);
    try {
      await loansApi.returnByLoan(row.id);
      message.success('归还成功');
      fetchList();
    } catch (err) {
      message.error(err?.message || '归还失败');
    } finally {
      setReturningId(null);
    }
  }

  const columns = [
    {
      title: '图书',
      render: (_, row) => (
        <Space>
          <img
            src={row.book_cover_url || PLACEHOLDER_COVER}
            alt={row.book_title}
            className="cover-thumb"
            onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
          />
          <span>{row.book_title} <span style={{ color: '#8c8c8c' }}>· {row.book_author}</span></span>
        </Space>
      ),
    },
    { title: '借出时间', dataIndex: 'loaned_at', width: 170, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '状态', dataIndex: 'returned_at', width: 100,
      render: (v) => v ? <Tag color="default">已归还</Tag> : <Tag color="processing">在借中</Tag>,
    },
    { title: '归还时间', dataIndex: 'returned_at', width: 170, render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—' },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, row) => !row.returned_at ? (
        <Button size="small" icon={<UndoOutlined />} loading={returningId === row.id} onClick={() => handleReturn(row)}>归还</Button>
      ) : null,
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
      </div>
      {loading && items.length === 0 ? <Skeleton active paragraph={{ rows: 4 }} /> : (
        items.length === 0
          ? <Empty description="暂无借阅记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          : <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={false} />
      )}
    </>
  );
}

function BrowseBooksPane() {
  const { message } = AntdApp.useApp();
  const [query, setQuery] = useState({ keyword: '', category: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });
  const [actingId, setActingId] = useState(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, q = query) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: ps };
      if (q.keyword) params.keyword = q.keyword;
      if (q.category) params.category = q.category;
      const res = await booksApi.list(params);
      setData(res);
      setPage(res.page);
      setPageSize(res.page_size);
    } catch (err) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, message]);

  useEffect(() => { fetchList(page, pageSize, query); /* eslint-disable-line */ }, []);

  async function handleLoan(bookId) {
    setActingId(bookId);
    try {
      await loansApi.loan(bookId);
      message.success('借阅成功');
      fetchList(page, pageSize, query);
    } catch (err) {
      message.error(err?.message || '借阅失败');
    } finally {
      setActingId(null);
    }
  }

  const columns = [
    { title: '书名', dataIndex: 'title' },
    { title: '作者', dataIndex: 'author', width: 120 },
    { title: '分类', dataIndex: 'category', width: 80, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '库存', dataIndex: 'stock', width: 80 },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, row) => (
        <Button type="primary" size="small" loading={actingId === row.id} disabled={row.stock <= 0} onClick={() => handleLoan(row.id)}>
          {row.stock > 0 ? '借阅' : '暂无库存'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Input.Search
          placeholder="搜索书名/作者/ISBN"
          allowClear
          style={{ width: 280 }}
          defaultValue={query.keyword}
          onSearch={(v) => { setQuery((q) => ({ ...q, keyword: v.trim() })); setPage(1); fetchList(1, pageSize, { ...query, keyword: v.trim() }); }}
        />
        <Select
          placeholder="分类"
          allowClear
          style={{ width: 160 }}
          value={query.category || undefined}
          onChange={(v) => { const nv = v || ''; setQuery((q) => ({ ...q, category: nv })); setPage(1); fetchList(1, pageSize, { ...query, category: nv }); }}
          options={CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => fetchList(page, pageSize, query)}>刷新</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.list}
        pagination={{
          current: page, pageSize, total: data.total, showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); fetchList(p, ps, query); },
        }}
      />
    </>
  );
}
