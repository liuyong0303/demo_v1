import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Button, Space, Spin, App as AntdApp, Alert, Tag, Popconfirm } from 'antd';
import { EditOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { booksApi, reservationsApi, loansApi } from '../api';
import { PLACEHOLDER_COVER, RESERVATION_STATUS } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export default function BookDetailModal({ open, bookId, onClose, onEdit }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [resInfo, setResInfo] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [loaning, setLoaning] = useState(false);
  const { message } = AntdApp.useApp();
  const { isReader, isAdmin } = useAuth();

  async function refresh() {
    if (!open || !bookId) return;
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        booksApi.get(bookId),
        booksApi.reservationInfo(bookId).catch(() => null),
      ]);
      setDetail(d);
      setResInfo(r);
    } catch (err) {
      message.error(err?.message || '获取详情失败');
      onClose && onClose();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && bookId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookId]);

  async function handleReserve() {
    setReserving(true);
    try {
      const r = await reservationsApi.create(bookId);
      message.success(`预约成功，当前排在第 ${r.queue_position} 位`);
      await refresh();
    } catch (err) {
      message.error(err?.message || '预约失败');
    } finally {
      setReserving(false);
    }
  }

  async function handleLoan() {
    setLoaning(true);
    try {
      await loansApi.loan(bookId);
      message.success('借阅成功');
      await refresh();
    } catch (err) {
      message.error(err?.message || '借阅失败');
    } finally {
      setLoaning(false);
    }
  }

  function renderReservationBlock() {
    if (!resInfo) return null;
    const {
      available_copies, waiting_count, reservable, my_reservation,
      free_slots, pickup_window_hours, enabled, hold_count,
    } = resInfo;

    if (!enabled) {
      return <Alert type="warning" showIcon message="预约功能已临时关闭" style={{ marginTop: 16 }} />;
    }

    if (my_reservation) {
      const cfg = RESERVATION_STATUS[my_reservation.status] || { label: my_reservation.status, color: 'default' };
      const desc = my_reservation.status === 'WAITING_NOTIFY'
        ? `当前排队位置：第 ${my_reservation.queue_position} 位`
        : my_reservation.status === 'READY_FOR_PICKUP'
          ? '图书已为您保留，请尽快到馆取书'
          : '';
      return (
        <Alert
          type="info"
          showIcon
          icon={<CalendarOutlined />}
          message={<>您已预约该书 <Tag color={cfg.color} style={{ marginInlineStart: 6 }}>{cfg.label}</Tag></>}
          description={desc}
          style={{ marginTop: 16 }}
        />
      );
    }

    let statusText = '';
    let canReserve = false;
    let canLoan = false;
    let reason = '';

    if (!isReader) {
      if (available_copies > 0) {
        statusText = `当前在馆可借 ${available_copies} 本`;
      } else if (hold_count > 0) {
        statusText = `全部借出，${hold_count} 本已为预约读者保留，${waiting_count} 人排队中`;
      } else {
        statusText = `全部借出，${waiting_count} 人排队中`;
      }
    } else if (free_slots > 0) {
      canLoan = true;
      statusText = `当前在馆可借 ${free_slots} 本，可直接借阅`;
    } else if (reservable) {
      canReserve = true;
      if (hold_count > 0) {
        statusText = `当前有 ${hold_count} 本为预约读者保留中，另有 ${waiting_count} 人排队，您可加入队列`;
      } else {
        statusText = `当前所有可借副本均已借出，${waiting_count} 人排队，您可以预约`;
      }
      reason = `预约成功后将按排队顺序通知；取书有效期为 ${pickup_window_hours / 24} 天`;
    } else {
      statusText = '当前无法预约';
    }

    return (
      <Alert
        type={canReserve ? 'info' : canLoan ? 'success' : 'warning'}
        showIcon
        style={{ marginTop: 16 }}
        message={
          <Space wrap>
            <span>{statusText}</span>
            {waiting_count > 0 && !my_reservation && (
              <Tag color="blue">排队 {waiting_count} 人</Tag>
            )}
          </Space>
        }
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            {reason && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{reason}</span>}
            {isReader && (
              <Space wrap>
                {canLoan && (
                  <Button type="primary" size="small" loading={loaning} onClick={handleLoan}>立即借阅</Button>
                )}
                {canReserve && (
                  <Popconfirm
                    title="确认预约该书？"
                    description={`预约后将占用您的预约名额（每人最多 5 本），到书后将通知您在 ${pickup_window_hours / 24} 天内取书。`}
                    okText="确认预约"
                    cancelText="取消"
                    onConfirm={handleReserve}
                  >
                    <Button type="primary" size="small" loading={reserving} icon={<CalendarOutlined />}>预约此书</Button>
                  </Popconfirm>
                )}
              </Space>
            )}
          </Space>
        }
      />
    );
  }

  return (
    <Modal
      open={open}
      title="图书详情"
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          {isAdmin && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={!detail}
              onClick={() => onEdit && onEdit(detail)}
            >编辑</Button>
          )}
        </Space>
      }
      width={760}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : detail ? (
        <div>
          <div className="detail-meta">
            <div>
              <img
                src={detail.cover_url || PLACEHOLDER_COVER}
                alt={detail.title}
                onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
                className="cover-large"
              />
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="书名">{detail.title}</Descriptions.Item>
              <Descriptions.Item label="作者">{detail.author}</Descriptions.Item>
              <Descriptions.Item label="ISBN">{detail.isbn}</Descriptions.Item>
              <Descriptions.Item label="分类">{detail.category}</Descriptions.Item>
              <Descriptions.Item label="库存">{detail.stock}</Descriptions.Item>
              <Descriptions.Item label="价格（元）">{Number(detail.price).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(detail.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{dayjs(detail.updated_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            </Descriptions>
          </div>
          {renderReservationBlock()}
        </div>
      ) : null}
    </Modal>
  );
}
