import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, App as AntdApp } from 'antd';
import { booksApi } from '../api';
import { CATEGORY_OPTIONS, FIELD_LABELS, PLACEHOLDER_COVER } from '../constants';

const INITIAL_VALUES = {
  title: '',
  author: '',
  isbn: '',
  category: '其他',
  stock: 0,
  price: 0,
  cover_url: '',
};

function norm(v) {
  return (v ?? '').toString().trim();
}

// ISBN 校验（去连字符后 10/13 位数字）
function validateISBN(_, value) {
  const v = norm(value).replace(/-/g, '');
  if (!v) return Promise.reject(new Error('请输入ISBN'));
  if (!/^\d{10}$|^\d{13}$/.test(v)) return Promise.reject(new Error('ISBN 需为 10 位或 13 位数字'));
  return Promise.resolve();
}

// 价格：≥0 最多 2 位小数
function validatePrice(_, value) {
  if (value === null || value === undefined || value === '') return Promise.reject(new Error('请输入价格'));
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return Promise.reject(new Error('价格需为 ≥ 0 的数字，最多 2 位小数'));
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return Promise.reject(new Error('价格需为 ≥ 0 的数字，最多 2 位小数'));
  return Promise.resolve();
}

function validateCover(_, value) {
  const v = norm(value);
  if (!v) return Promise.resolve();
  if (!/^https?:\/\/[^\s]+$/i.test(v)) return Promise.reject(new Error('请输入合法的 http(s) 图片链接'));
  return Promise.resolve();
}

export default function BookFormModal({ open, mode, initialBook, onCancel, onSaved, parentMessage }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isbnConflictMsg, setIsbnConflictMsg] = useState('');
  const message = parentMessage;
  const firstErrorRef = useRef(null);

  const isEdit = mode === 'edit';
  const title = useMemo(() => (isEdit ? '编辑图书' : '新增图书'), [isEdit]);

  useEffect(() => {
    if (!open) return;
    setIsbnConflictMsg('');
    if (isEdit && initialBook) {
      form.setFieldsValue({
        title: initialBook.title || '',
        author: initialBook.author || '',
        isbn: initialBook.isbn || '',
        category: initialBook.category || '其他',
        stock: initialBook.stock ?? 0,
        price: initialBook.price ?? 0,
        cover_url: initialBook.cover_url || '',
      });
    } else {
      form.setFieldsValue(INITIAL_VALUES);
    }
    setDirty(false);
  }, [open, isEdit, initialBook, form]);

  const initialSnapshot = useMemo(() => {
    if (!open) return null;
    if (isEdit && initialBook) {
      return JSON.stringify({
        title: initialBook.title, author: initialBook.author, isbn: initialBook.isbn,
        category: initialBook.category, stock: initialBook.stock, price: initialBook.price,
        cover_url: initialBook.cover_url || '',
      });
    }
    return JSON.stringify(INITIAL_VALUES);
  }, [open, isEdit, initialBook]);

  function computeDirty() {
    const current = form.getFieldsValue();
    const snapshot = {
      title: norm(initialBook?.title) || '',
      author: norm(initialBook?.author) || '',
      isbn: (initialBook?.isbn || '').replace(/-/g, '').trim(),
      category: initialBook?.category || '其他',
      stock: initialBook?.stock ?? 0,
      price: initialBook?.price ?? 0,
      cover_url: norm(initialBook?.cover_url) || '',
    };
    if (isEdit) {
      return (
        norm(current.title) !== snapshot.title ||
        norm(current.author) !== snapshot.author ||
        norm(current.isbn).replace(/-/g,'') !== snapshot.isbn ||
        (current.category || '') !== snapshot.category ||
        Number(current.stock) !== snapshot.stock ||
        Number(current.price) !== snapshot.price ||
        norm(current.cover_url) !== snapshot.cover_url
      );
    }
    // 新增：判断是否任何非默认字段被修改
    return (
      !!norm(current.title) || !!norm(current.author) || !!norm(current.isbn) ||
      (current.category && current.category !== '其他') ||
      Number(current.stock) !== 0 || Number(current.price) !== 0 || !!norm(current.cover_url)
    );
  }

  function handleCancel() {
    if (submitting) return;
    if (dirty) {
      Modal.confirm({
        title: '提示',
        content: '当前表单尚未保存，确定离开吗？',
        okText: '确定离开',
        cancelText: '继续编辑',
        onOk: () => { setDirty(false); onCancel && onCancel(); },
      });
    } else {
      onCancel && onCancel();
    }
  }

  async function handleOk() {
    try {
      setIsbnConflictMsg('');
      const values = await form.validateFields();
      // trim
      const payload = {
        title: values.title.trim(),
        author: values.author.trim(),
        isbn: values.isbn.replace(/-/g, '').trim(),
        category: values.category,
        stock: Number(values.stock),
        price: Number(values.price),
        cover_url: values.cover_url ? values.cover_url.trim() : '',
      };
      setSubmitting(true);
      try {
        const saved = isEdit
          ? await booksApi.update(initialBook.id, payload)
          : await booksApi.create(payload);
        message.success('保存成功');
        setDirty(false);
        onSaved && onSaved(saved);
      } catch (err) {
        if (err?.code === 'DuplicateISBN') {
          setIsbnConflictMsg(err.message);
          form.setFields([{ name: 'isbn', errors: [err.message] }]);
          firstErrorRef.current = 'isbn';
          setTimeout(() => form.focusField?.('isbn'), 0);
        } else if (err?.code === 'ValidationError' && err.errors) {
          const fields = Object.keys(err.errors).map((k) => ({ name: k, errors: [err.errors[k]] }));
          form.setFields(fields);
          setTimeout(() => {
            if (fields[0]) form.focusField?.(fields[0].name);
          }, 0);
        } else {
          message.error(err?.message || '保存失败，请稍后重试');
        }
      } finally {
        setSubmitting(false);
      }
    } catch (_) {
      // validateFields 失败会自动展示错误
      setTimeout(() => {
        const firstErr = document.querySelector('.ant-form-item-has-error .ant-input, .ant-form-item-has-error .ant-input-number-input');
        if (firstErr) firstErr.focus();
      }, 0);
    }
  }

  function onValuesChange() {
    setDirty(computeDirty());
    if (isbnConflictMsg) setIsbnConflictMsg('');
  }

  return (
    <Modal
      open={open}
      title={title}
      onCancel={handleCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      maskClosable={false}
      destroyOnClose
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={INITIAL_VALUES}
        onValuesChange={onValuesChange}
        disabled={submitting}
      >
        <Form.Item
          name="title"
          label={FIELD_LABELS.title}
          rules={[
            { required: true, whitespace: true, message: '请输入书名' },
            { max: 100, message: '书名长度不能超过 100 个字符' },
          ]}
          getValueFromEvent={(e) => e.target.value}
          normalize={(v) => v}
        >
          <Input placeholder="请输入书名" maxLength={100} allowClear />
        </Form.Item>
        <Form.Item
          name="author"
          label={FIELD_LABELS.author}
          rules={[
            { required: true, whitespace: true, message: '请输入作者' },
            { max: 50, message: '作者长度不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="请输入作者" maxLength={50} allowClear />
        </Form.Item>
        <Form.Item
          name="isbn"
          label={FIELD_LABELS.isbn}
          rules={[{ validator: validateISBN }]}
          extra="支持带连字符输入，保存时会自动去除；ISBN 全局唯一（含已下架图书）。"
        >
          <Input placeholder="请输入 10 位或 13 位 ISBN" allowClear />
        </Form.Item>
        <Form.Item
          name="category"
          label={FIELD_LABELS.category}
          rules={[{ required: true, message: '请选择分类' }]}
        >
          <Select
            placeholder="请选择分类"
            options={CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))}
          />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item
            name="stock"
            label={FIELD_LABELS.stock}
            rules={[
              { required: true, message: '请输入库存' },
              { type: 'integer', min: 0, message: '库存需为 ≥ 0 的整数' },
            ]}
            getValueFromEvent={(v) => (v === '' || v === null ? '' : Number(v))}
          >
            <InputNumber min={0} precision={0} step={1} style={{ width: '100%' }} placeholder="库存" />
          </Form.Item>
          <Form.Item
            name="price"
            label={`${FIELD_LABELS.price}（元）`}
            rules={[{ validator: validatePrice }]}
          >
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="价格" />
          </Form.Item>
        </div>
        <Form.Item name="cover_url" label={FIELD_LABELS.cover} rules={[{ validator: validateCover }]}>
          <Input placeholder="请输入 http(s) 封面图片链接（选填）" allowClear />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.cover_url !== cur.cover_url}>
          {({ getFieldValue }) => (
            <div style={{ color: '#8c8c8c', fontSize: 12 }}>
              封面预览：
              <img
                src={getFieldValue('cover_url') || PLACEHOLDER_COVER}
                alt="封面预览"
                onError={(e) => { if (e.target.src !== PLACEHOLDER_COVER) e.target.src = PLACEHOLDER_COVER; }}
                className="cover-thumb"
                style={{ verticalAlign: 'middle', marginLeft: 8 }}
              />
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}
