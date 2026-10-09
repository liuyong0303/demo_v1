import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Col, Empty, Row, Space, Spin, Statistic, Table, Tag, App as AntdApp, theme,
} from 'antd';
import {
  ReloadOutlined, BookOutlined, FileDoneOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { reportsApi } from '../api';

export default function ReportsPage() {
  const { token } = theme.useToken();
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ total_books: 0, borrowed_count: 0, top_borrowed: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.overview();
      setData({
        total_books: Number.isFinite(res?.total_books) ? res.total_books : 0,
        borrowed_count: Number.isFinite(res?.borrowed_count) ? res.borrowed_count : 0,
        top_borrowed: Array.isArray(res?.top_borrowed) ? res.top_borrowed : [],
      });
    } catch (err) {
      setError(err?.message || '报表加载失败，请稍后重试');
      message.error(err?.message || '报表加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: '名次',
      dataIndex: 'rank',
      key: 'rank',
      width: 72,
      align: 'center',
      render: (_, __, idx) => {
        const rank = idx + 1;
        const colors = { 1: token.colorWarning, 2: '#8c8c8c', 3: '#d46b08' };
        if (rank <= 3) {
          return (
            <Tag
              color={colors[rank]}
              style={{ minWidth: 28, textAlign: 'center', marginInlineEnd: 0 }}
            >
              TOP{rank}
            </Tag>
          );
        }
        return <span style={{ color: token.colorTextSecondary }}>{rank}</span>;
      },
    },
    {
      title: '书名',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (t) => <strong style={{ color: token.colorText }}>{t}</strong>,
    },
    { title: '作者', dataIndex: 'author', key: 'author', width: 200, ellipsis: true },
    {
      title: '借阅次数',
      dataIndex: 'borrow_count',
      key: 'borrow_count',
      width: 120,
      align: 'right',
      render: (v) => (
        <span style={{ fontWeight: 600, color: token.colorPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {Number.isFinite(v) ? v : 0}
        </span>
      ),
      sorter: false,
      defaultSortOrder: 'descend',
    },
  ];

  const maxCount = data.top_borrowed[0]?.borrow_count || 0;

  return (
    <div>
      <div className="page-header">
        <Space size={8}>
          <BarChartOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>图书报表</span>
        </Space>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>
      </div>

      {error ? (
        <Card>
          <div className="error-block" style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, color: token.colorError, fontWeight: 500, marginBottom: 6 }}>
              报表加载失败，请稍后重试
            </div>
            <div style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 16 }}>{error}</div>
            <Button type="primary" onClick={load} loading={loading} icon={<ReloadOutlined />}>
              重试
            </Button>
          </div>
        </Card>
      ) : (
        <Spin spinning={loading && !data.top_borrowed.length && data.total_books === 0 && data.borrowed_count === 0}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Card>
                <Space size={16} align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Statistic
                    title="图书总量"
                    value={data.total_books}
                    suffix="种"
                    valueStyle={{ color: token.colorTextHeading }}
                  />
                  <div style={{
                    width: 48, height: 48, borderRadius: 8,
                    background: '#e6f4ff', color: token.colorPrimary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    <BookOutlined />
                  </div>
                </Space>
                <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                  当前有效馆藏书目种数
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12}>
              <Card>
                <Space size={16} align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Statistic
                    title="已借出数量"
                    value={data.borrowed_count}
                    suffix="本"
                    valueStyle={{ color: token.colorWarning }}
                  />
                  <div style={{
                    width: 48, height: 48, borderRadius: 8,
                    background: '#fff7e6', color: token.colorWarning,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    <FileDoneOutlined />
                  </div>
                </Space>
                <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                  当前处于借出状态的图书册数
                </div>
              </Card>
            </Col>
          </Row>

          <Card
            style={{ marginTop: 16 }}
            title={
              <Space>
                <BarChartOutlined style={{ color: token.colorPrimary }} />
                <span>借阅量 Top5</span>
              </Space>
            }
          >
            {loading && !data.top_borrowed.length ? (
              <div style={{ padding: 24 }}><Spin /></div>
            ) : data.top_borrowed.length === 0 ? (
              <Empty description="暂无借阅数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <>
                <Table
                  rowKey="book_id"
                  columns={columns}
                  dataSource={data.top_borrowed}
                  pagination={false}
                  size="middle"
                  loading={loading}
                />
                {maxCount > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 8 }}>
                      借阅次数对比
                    </div>
                    {data.top_borrowed.map((row, idx) => (
                      <div key={row.book_id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ width: 36, textAlign: 'right', color: token.colorTextSecondary, fontSize: 12 }}>
                          {idx + 1}
                        </div>
                        <div style={{
                          flex: 1, height: 8, background: token.colorFillSecondary, borderRadius: 4, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${Math.max(4, (row.borrow_count / maxCount) * 100)}%`,
                            height: '100%',
                            background: idx < 3 ? token.colorPrimary : token.colorInfo,
                            borderRadius: 4,
                          }} />
                        </div>
                        <div style={{
                          width: 50, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        }}>{row.borrow_count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </Spin>
      )}
    </div>
  );
}
