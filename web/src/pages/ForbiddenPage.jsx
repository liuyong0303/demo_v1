import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="403"
      subTitle="你没有访问该页面的权限"
      extra={
        <Button type="primary" onClick={() => navigate('/books')}>返回首页</Button>
      }
    />
  );
}
