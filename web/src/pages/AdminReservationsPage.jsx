import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Input, Select, Table, Space, Tag, Skeleton, App as AntdApp, Modal, Form, Popconfirm, Typography, Timeline, Drawer, Descriptions, DatePicker, Tooltip,
} from 'antd';
import { ReloadOutlined, StopOutlined, EyeOutlined, CommentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { reservationsApi } from '../api';
import { DEFAULT_PAGE_SIZE, PLACEHOLDER_COVER, RESERVATION_STATUS, RESERVATION_STATUS_OPTIONS } from '../constants';

const { Text, Paragraph } = Typography;

const CANCEL_REASON_OPTIONS = [
  '读者证丢失', '读者主动要求', '读者违规处理', '图书异常下架', '其他',
];

export default function AdminReservationsPage() {
  const { message, modal } = AntdApp.useApp();
  const [query, setQuery] = useState({ reader_keyword: '', book_keyword: '', status: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ list: [], total: 0 });
  const [cancellingId, setCancellingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [cancelForm] = Form.useForm();
  const [noteForm] = Form.useForm();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [targetRow, setTargetRow] = useState(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, q = query) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: ps };
      if (q.reader_keyword) params.reader_keyword = q.reader_keyword;
      if (q.book_keyword) params.book_keyword = q.book_keyword;
      if (q.status) params.status = q.status;
      if (q.reserved_from) params.reserved_from = q.reserved_from;
      if (q.reserved_to) params.reserved_to = q.reserved_to;
      if (q.notified_from) params.notified_from = q.notified_from;
      if (q.notified_to) params.notified_to = q.notified_to;
      const res = await reservationsApi.listAdmin(params);
      setData(res);
      if (res.total > 0 && res.items.length === 0 && p > 1) {
        const prev = p - 1; setPage(prev); fetchList(prev, ps, q); return;
      }
      setPage(res.page); setPageSize(res.page_size);
    } catch (err) {
      message.error(err?.message || '获取列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, message]);

  useEffect(() => { fetchList(page, pageSize, query); /* eslint-disable-line */ }, []);

  function handleSearch() {
    setPage(1);
    fetchList(1, pageSize, query);
  }

  function openCancel(row) {
    setTargetRow(row);
    cancelForm.resetFields();
    cancelForm.setFieldsValue({ reason: CANCEL_REASON_OPTIONS[1] });
    setCancelOpen(true);
  }

  async function submitCancel() {
    try {
      const values = await cancelForm.validateFields();
      setCancellingId(targetRow.id);
      await reservationsApi.adminCancel(targetRow.id, values.reason);
      message.success('已取消该预约');
      setCancelOpen(false);
      setTargetRow(null);
      fetchList(page, pageSize, query);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.message || '取消失败');
    } finally {
      setCancellingId(null);
    }
  }

  function openNote(row) {
    setTargetRow(row);
    noteForm.resetFields();
    setNoteOpen(true);
  }

  async function submitNote() {
    try {
      const values = await noteForm.validateFields();
      await reservationsApi.adminAddNote(targetRow.id, values.content);
      message.success('备注已添加');
      setNoteOpen(false);
      setTargetRow(null);
      if (detailId === targetRow.id) setDetailId(null); // trigger refresh
      fetchList(page, pageSize, query);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.message || '备注添加失败');
    }
  }

  const columns = [
    {
      title: '读者',
      key: 'reader',
      width: 160,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.reader_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.reader_card_no}</Text>
        </Space>
      ),
    },
    {
      title: '图书',
      key: 'book',
      render: (_, row) => (
        <Space>
          <img
            src={row.book_cover_url || PLACEHOLDER_COVER}
            alt={row.book_title}
            className="cover-thumb"
            onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
          />
          <Space direction="vertical" size={0}>
            <Text strong>{row.book_title}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{row.book_author} · {row.book_isbn}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: (v) => {
        const cfg = RESERVATION_STATUS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '预约时间', dataIndex: 'created_at', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '通知/截止',
      key: 'notified',
      width: 220,
      render: (_, row) => row.notified_at ? (
        <Space direction="vertical" size={0}>
          <Text>通知：{dayjs(row.notified_at).format('MM-DD HH:mm')}</Text>
          <Text type={dayjs(row.expire_at).isBefore(dayjs()) ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
            截止：{row.expire_at ? dayjs(row.expire_at).format('YYYY-MM-DD HH:mm') : '—'}
          </Text>
        </Space>
      ) : <Text type="secondary">排队中</Text>,
    },
    {
      title: '终态',
      key: 'finished',
      width: 160,
      render: (_, row) => row.finished_at ? (
        <Space direction="vertical" size={0}>
          <Text>{row.finish_reason}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(row.finished_at).format('YYYY-MM-DD HH:mm')}</Text>
        </Space>
      ) : '—',
    },
    {
      title: '操作', key: 'actions', width: 220, fixed: 'right',
      render: (_, row) => (
        <Space>
          <Tooltip title="查看详情"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(row.id)}>详情</Button></Tooltip>
          <Tooltip title="添加备注"><Button type="link" size="small" icon={<CommentOutlined />} onClick={() => openNote(row)}>备注</Button></Tooltip>
          {['WAITING_NOTIFY', 'READY_FOR_PICKUP'].includes(row.status) ? (
            <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => openCancel(row)}>取消</Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div style={{ fontSize: 16, fontWeight: 600 }}>预约管理</div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList(page, pageSize, query)}>刷新</Button>
        </Space>
      </div>

      <div className="filter-bar">
        <Input
          placeholder="读者姓名/证号"
          allowClear
          style={{ width: 180 }}
          value={query.reader_keyword}
          onChange={(e) => setQuery((q) => ({ ...q, reader_keyword: e.target.value }))}
        />
        <Input
          placeholder="书名/ISBN"
          allowClear
          style={{ width: 200 }}
          value={query.book_keyword}
          onChange={(e) => setQuery((q) => ({ ...q, book_keyword: e.target.value }))}
        />
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 160 }}
          value={query.status || undefined}
          onChange={(v) => setQuery((q) => ({ ...q, status: v || '' }))}
          options={RESERVATION_STATUS_OPTIONS}
        />
        <span style={{ color: '#595959' }}>预约时间：</span>
        <DatePicker.RangePicker
          showTime
          onChange={(dates) => {
            setQuery((q) => ({
              ...q,
              reserved_from: dates?.[0]?.format('YYYY-MM-DD HH:mm:ss') || '',
              reserved_to: dates?.[1]?.format('YYYY-MM-DD HH:mm:ss') || '',
            }));
          }}
        />
        <Button type="primary" onClick={handleSearch}>查询</Button>
      </div>

      <div className="table-card">
        {loading && data.items.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data.items}
            pagination={{
              current: page, pageSize, total: data.total, showSizeChanger: true,
              pageSizeOptions: [10, 20, 50], showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); fetchList(p, ps, query); },
            }}
            scroll={{ x: 1200 }}
          />
        )}
      </div>

      <ReservationDetailDrawer
        id={detailId}
        onClose={() => setDetailId(null)}
      />

      <Modal
        open={cancelOpen}
        title="管理员取消预约"
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ danger: true, loading: !!cancellingId }}
        onCancel={() => { setCancelOpen(false); setTargetRow(null); }}
        onOk={submitCancel}
        destroyOnClose
      >
        <Paragraph type="warning">取消待取书预约会立即释放名额给下一位排队读者，且不可恢复。</Paragraph>
        <Form form={cancelForm} layout="vertical">
          <Form.Item name="reason" label="取消原因（必填）" rules={[{ required: true, message: '请填写或选择取消原因' }]}>
            <Input.TextArea rows={3} placeholder="请填写取消原因，将同步记录到审计日志" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={noteOpen}
        title="添加异常备注"
        okText="保存"
        cancelText="取消"
        onCancel={() => { setNoteOpen(false); setTargetRow(null); }}
        onOk={submitNote}
        destroyOnClose
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item name="content" label="备注内容" rules={[{ required: true, message: '请输入备注内容' }]}>
            <Input.TextArea rows={4} placeholder="记录读者沟通、异常情况等" maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function ReservationDetailDrawer({ id, onClose }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!id) { setDetail(null); return; }
    setLoading(true);
    reservationsApi.getAdmin(id)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Drawer
      width={640}
      open={!!id}
      title={`预约详情 #${id || ''}`}
      onClose={onClose}
      destroyOnClose
    >
      {loading && <Skeleton active paragraph={{ rows: 8 }} />}
      {!loading && detail && (
        <>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="读者">{detail.reader_name}（{detail.reader_card_no}）</Descriptions.Item>
            <Descriptions.Item label="图书">{detail.book_title} · {detail.book_author}（{detail.book_isbn}）</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={(RESERVATION_STATUS[detail.status] || {}).color}>{(RESERVATION_STATUS[detail.status] || {}).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="预约时间">{detail.created_at}</Descriptions.Item>
            <Descriptions.Item label="通知时间">{detail.notified_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="取书截止">{detail.expire_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="终态原因">{detail.finish_reason || '—'}</Descriptions.Item>
            <Descriptions.Item label="管理员备注">{detail.cancel_note || '—'}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 24, fontWeight: 600 }}>操作时间线</div>
          <Timeline
            style={{ marginTop: 12 }}
            items={(detail.notes || []).map((n) => ({
              color: n.action === 'CANCEL' ? 'red' : n.action === 'NOTIFY' ? 'blue' : 'gray',
              children: (
                <div>
                  <Space wrap>
                    <Text strong>{actionLabel(n.action)}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{n.created_at}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>by {authorLabel(n)}</Text>
                  </Space>
                  {n.note && <div style={{ color: '#595959' }}>{n.note}</div>}
                </div>
              ),
            }))}
          />
        </>
      )}
    </Drawer>
  );
}

function actionLabel(action) {
  const map = {
    CREATE: '创建预约', NOTIFY: '通知取书', COMPLETE: '完成取书',
    CANCEL: '取消预约', EXPIRE: '预约过期', NOTE: '备注',
    RETURN_TRIGGER: '归还触发', LOAN_COMPLETE: '借出完成',
  };
  return map[action] || action;
}
function authorLabel(n) {
  if (n.author_type === 'SYSTEM') return '系统';
  return `${n.author_type === 'ADMIN' ? '管理员' : '读者'}#${n.author_id}`;
}
