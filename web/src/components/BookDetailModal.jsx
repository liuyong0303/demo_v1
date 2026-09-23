import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Button, Space, Spin, App as AntdApp } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { booksApi } from '../api';
import { PLACEHOLDER_COVER } from '../constants';

export default function BookDetailModal({ open, bookId, onClose, onEdit }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const { message } = AntdApp.useApp();

  useEffect(() => {
    if (!open || !bookId) return;
    setLoading(true);
    setDetail(null);
    booksApi.get(bookId)
      .then((d) => setDetail(d))
      .catch((err) => {
        message.error(err?.message || '获取详情失败');
        onClose && onClose();
      })
      .finally(() => setLoading(false));
  }, [open, bookId, message, onClose]);

  return (
    <Modal
      open={open}
      title="图书详情"
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button
            type="primary"
            icon={<EditOutlined />}
            disabled={!detail}
            onClick={() => onEdit && onEdit(detail)}
          >编辑</Button>
        </Space>
      }
      width={720}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : detail ? (
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
      ) : null}
    </Modal>
  );
}
