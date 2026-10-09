import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Select, Table, Space, Tag, Skeleton, App as AntdApp, Empty, Popconfirm, Typography, Tooltip,
} from 'antd';
import { ReloadOutlined, CalendarOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { reservationsApi } from '../api';
import { DEFAULT_PAGE_SIZE, PLACEHOLDER_COVER, RESERVATION_STATUS, RESERVATION_STATUS_OPTIONS } from '../constants';
import { useAuth } from '../contexts/AuthContext';

const { Text } = Typography;

export default function MyReservationsPage() {
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });
  const [cancellingId, setCancellingId] = useState(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, s = status) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: ps };
      if (s) params.status = s;
      const res = await reservationsApi.listMine(params);
      setData(res);
      if (res.total > 0 && res.items.length === 0 && p > 1) {
        const prev = p - 1;
        setPage(prev);
        fetchList(prev, ps, s);
        return;
      }
      setPage(res.page);
      setPageSize(res.page_size);
    } catch (err) {
      message.error(err?.message || '获取列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, message]);

  useEffect(() => { fetchList(page, pageSize, status); /* eslint-disable-line */ }, [user?.id]);

  function handleSearch() {
    setPage(1);
    fetchList(1, pageSize, status);
  }

  async function handleCancel(row) {
    setCancellingId(row.id);
    try {
      await reservationsApi.cancelMine(row.id);
      message.success('预约已取消');
      fetchList(page, pageSize, status);
    } catch (err) {
      message.error(err?.message || '取消失败');
    } finally {
      setCancellingId(null);
    }
  }

  const columns = [
    {
      title: '图书',
      dataIndex: 'book_title',
      render: (v, row) => (
        <Space>
          <img
            src={row.book_cover_url || PLACEHOLDER_COVER}
            alt={v}
            className="cover-thumb"
            onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
          />
          <Space direction="vertical" size={0}>
            <Text strong>{v}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{row.book_author} · {row.book_isbn}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (v, row) => {
        const cfg = RESERVATION_STATUS[v] || { label: v, color: 'default' };
        return (
          <Space direction="vertical" size={0}>
            <Tag color={cfg.color}>{cfg.label}</Tag>
            {row.queue_position && <Text type="secondary" style={{ fontSize: 12 }}>前面 {row.queue_position - 1} 人</Text>}
          </Space>
        );
      },
    },
    {
      title: '预约时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '通知/截止/完成',
      key: 'times',
      width: 220,
      render: (_, row) => {
        if (row.status === 'WAITING_NOTIFY') return <Text type="secondary">等待图书归还...</Text>;
        if (row.status === 'READY_FOR_PICKUP') {
          const expired = dayjs(row.expire_at).isBefore(dayjs());
          return (
            <Space direction="vertical" size={0}>
              <Text>通知时间：{dayjs(row.notified_at).format('MM-DD HH:mm')}</Text>
              <Text type={expired ? 'danger' : 'secondary'}>
                截止：{dayjs(row.expire_at).format('YYYY-MM-DD HH:mm')}
                {!expired && <Tooltip title={`距截止 ${dayjs(row.expire_at).fromNow(true)}`}><span> · 倒计时中</span></Tooltip>}
              </Text>
            </Space>
          );
        }
        return (
          <Space direction="vertical" size={0}>
            <Text>{row.finish_reason}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(row.finished_at).format('YYYY-MM-DD HH:mm')}</Text>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, row) => {
        const canCancel = row.status === 'WAITING_NOTIFY' || row.status === 'READY_FOR_PICKUP';
        if (!canCancel) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        return (
          <Popconfirm
            title="确认取消该预约？"
            description={
              row.status === 'READY_FOR_PICKUP'
                ? '取消后名额将立即顺延给下一位读者，且不可恢复。'
                : '取消后将释放您的预约名额。'
            }
            okText="确认取消"
            cancelText="再想想"
            okButtonProps={{ danger: true, loading: cancellingId === row.id }}
            onConfirm={() => handleCancel(row)}
          >
            <Button type="link" size="small" danger icon={<StopOutlined />}>取消预约</Button>
          </Popconfirm>
        );
      },
    },
  ];

  const empty = data.total === 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>我的预约</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList(page, pageSize, status)}>刷新</Button>
        </Space>
      </div>

      <div className="filter-bar">
        <span style={{ color: '#595959' }}>状态：</span>
        <Select
          placeholder="全部状态"
          allowClear
          style={{ width: 180 }}
          value={status || undefined}
          onChange={(v) => setStatus(v || '')}
          options={RESERVATION_STATUS_OPTIONS}
        />
        <Button type="primary" onClick={handleSearch}>查询</Button>
      </div>

      <div className="table-card">
        {loading && data.items.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : empty ? (
          status ? (
            <Empty description="该状态下暂无预约记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Empty
              description={<>您还没有预约记录，去<Button type="link" onClick={() => { window.location.hash = ''; window.location.href = '/books'; }}>看看热门图书</Button>吧</>}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )
        ) : (
          <>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={data.items}
              pagination={false}
              scroll={{ x: 860 }}
            />
            <div className="pagination-wrap">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={data.total}
                onChange={(p, ps) => { setPage(p); setPageSize(ps); fetchList(p, ps, status); }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { Pagination as AntPagination } from 'antd';
function Pagination({ page, pageSize, total, onChange }) {
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
