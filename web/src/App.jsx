import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import BooksPage from './pages/BooksPage';
import NotFoundPage from './pages/NotFoundPage';
import ForbiddenPage from './pages/ForbiddenPage';

const { Sider, Content, Header } = Layout;

// TODO(auth): 接入真实登录态/角色校验；当前 demo 默认以管理员身份放行，
// 非管理员应重定向到 /forbidden。
function useIsAdmin() {
  return true;
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = useIsAdmin();

  if (!isAdmin) return <Navigate to="/forbidden" replace />;

  return (
    <Layout className="app-layout">
      <Sider breakpoint="lg" collapsedWidth="0">
        <div className="app-logo">Demo 后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname.startsWith('/books') ? '/books' : location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={[{ key: '/books', icon: <BookOutlined />, label: '图书管理' }]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', fontSize: 16, fontWeight: 600 }}>
          图书管理
        </Header>
        <Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/books" replace />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
}
