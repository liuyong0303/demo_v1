import React, { useCallback, useEffect, useState } from 'react';
import { Button, List, Tag, Skeleton, App as AntdApp, Space, Empty, Typography, Badge } from 'antd';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { messagesApi } from '../api';

const { Text, Paragraph } = Typography;

const TYPE_LABEL = {
  PICKUP_READY: { label: '取书通知', color: 'processing' },
  EXPIRED: { label: '预约过期', color: 'warning' },
  SYSTEM: { label: '系统通知', color: 'default' },
};

export default function MyMessagesPage() {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await messagesApi.listMine();
      setItems(res.items || []);
      setUnread(res.unread_count || 0);
    } catch (err) {
      message.error(err?.message || '获取消息失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function markRead(item) {
    if (item.is_read) return;
    try {
      await messagesApi.markRead(item.id);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_read: 1 } : i));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      message.error(err?.message || '操作失败');
    }
  }

  async function markAllRead() {
    try {
      await messagesApi.markAllRead();
      setItems((prev) => prev.map((i) => ({ ...i, is_read: 1 })));
      setUnread(0);
      message.success('已全部标记为已读');
    } catch (err) {
      message.error(err?.message || '操作失败');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          消息中心
          {unread > 0 && <Badge count={unread} style={{ marginInlineStart: 12 }} />}
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <Button icon={<CheckCircleOutlined />} onClick={markAllRead} disabled={unread === 0}>全部已读</Button>
        </Space>
      </div>

      <div className="table-card">
        {loading && items.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : items.length === 0 ? (
          <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={items}
            renderItem={(item) => {
              const cfg = TYPE_LABEL[item.type] || { label: item.type, color: 'default' };
              return (
                <List.Item
                  key={item.id}
                  actions={[
                    !item.is_read ? (
                      <Button type="link" size="small" onClick={() => markRead(item)}>标为已读</Button>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>已读</Text>
                    ),
                  ]}
                  style={{ background: item.is_read ? 'transparent' : '#f6ffed', borderRadius: 6, padding: 12 }}
                >
                  <List.Item.Meta
                    avatar={item.is_read ? null : <Badge status="processing" />}
                    title={
                      <Space>
                        <Tag color={cfg.color}>{cfg.label}</Tag>
                        <Text strong={!item.is_read}>{item.title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}</Text>
                      </Space>
                    }
                    description={<Paragraph style={{ marginBottom: 0 }}>{item.body}</Paragraph>}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
