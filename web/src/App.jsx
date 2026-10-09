import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Select, Space, Typography, Badge, Tooltip, Tag } from 'antd';
import {
  BookOutlined,
  ScheduleOutlined,
  BellOutlined,
  AuditOutlined,
  UserOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import BooksPage from './pages/BooksPage';
import MyReservationsPage from './pages/MyReservationsPage';
import MyMessagesPage from './pages/MyMessagesPage';
import LoansPage from './pages/LoansPage';
import AdminReservationsPage from './pages/AdminReservationsPage';
import NotFoundPage from './pages/NotFoundPage';
import ForbiddenPage from './pages/ForbiddenPage';
import { useAuth } from './contexts/AuthContext';
import { messagesApi } from './api';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

function UserSwitcher() {
  const { user, userList, switchToReader, switchToAdmin, isAdmin, isReader } = useAuth();
  if (!user) return null;
  return (
    <Space size={12}>
      <Select
        size="small"
        style={{ width: 120 }}
        value={isAdmin ? 'admin' : 'reader'}
        onChange={(v) => {
          if (v === 'admin' && userList.admins[0]) switchToAdmin(userList.admins[0].id);
          if (v === 'reader' && userList.readers[0]) switchToReader(userList.readers[0].id);
        }}
        options={[
          { label: '管理员视角', value: 'admin' },
          { label: '读者视角', value: 'reader' },
        ]}
      />
      {isAdmin && (
        <Select
          size="small"
          style={{ minWidth: 140 }}
          value={user.id}
          onChange={switchToAdmin}
          options={userList.admins.map((a) => ({ label: a.name, value: a.id }))}
        />
      )}
      {isReader && (
        <Select
          size="small"
          style={{ minWidth: 160 }}
          value={user.id}
          onChange={switchToReader}
          options={userList.readers.map((r) => {
            const suspended = r.suspended || r.outstanding_fine_cents > 0;
            return {
              label: (
                <Space>
                  <span>{r.name}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>({r.card_no})</Text>
                  {suspended && <Tag color="red" style={{ marginInlineEnd: 0 }}>受限</Tag>}
                </Space>
              ),
              value: r.id,
            };
          })}
        />
      )}
    </Space>
  );
}

function HeaderRight() {
  const { isReader, user } = useAuth();
  const [unread, setUnread] = React.useState(0);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isReader) { setUnread(0); return; }
    let mounted = true;
    function load() {
      messagesApi.listMine({ unread: 1 })
        .then((d) => { if (mounted) setUnread(d.unread_count || 0); })
        .catch(() => {});
    }
    load();
    const t = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(t); };
  }, [isReader, user?.id]);

  if (!isReader) return <UserSwitcher />;
  return (
    <Space size={16}>
      <Tooltip title="我的消息">
        <Badge count={unread} offset={[-2, 2]}>
          <BellOutlined
            style={{ fontSize: 18, cursor: 'pointer' }}
            onClick={() => navigate('/my/messages')}
          />
        </Badge>
      </Tooltip>
      <UserSwitcher />
    </Space>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isReader } = useAuth();

  // 菜单
  const menuItems = [];
  if (isAdmin) {
    menuItems.push({ key: '/books', icon: <BookOutlined />, label: '图书管理' });
    menuItems.push({ key: '/admin/reservations', icon: <AuditOutlined />, label: '预约管理' });
  }
  if (isReader) {
    menuItems.push({ key: '/books', icon: <BookOutlined />, label: '可借/可预约图书' });
    menuItems.push({ key: '/loans', icon: <SwapOutlined />, label: '我的借阅' });
    menuItems.push({ key: '/my/reservations', icon: <ScheduleOutlined />, label: '我的预约' });
    menuItems.push({ key: '/my/messages', icon: <BellOutlined />, label: '消息中心' });
  }

  // 选中 key
  const selectedKey = (() => {
    const p = location.pathname;
    if (p.startsWith('/books')) return '/books';
    if (p.startsWith('/admin/reservations')) return '/admin/reservations';
    if (p.startsWith('/my/reservations')) return '/my/reservations';
    if (p.startsWith('/my/messages')) return '/my/messages';
    if (p.startsWith('/loans')) return '/loans';
    return p;
  })();

  const title = (() => {
    if (location.pathname.startsWith('/admin/reservations')) return '预约管理';
    if (location.pathname.startsWith('/my/reservations')) return '我的预约';
    if (location.pathname.startsWith('/my/messages')) return '消息中心';
    if (location.pathname.startsWith('/loans')) return '我的借阅';
    return '图书管理';
  })();

  // 默认首页
  const defaultPath = isAdmin ? '/books' : '/books';

  return (
    <Layout className="app-layout">
      <Sider breakpoint="lg" collapsedWidth="0">
        <div className="app-logo">图书馆预约 Demo</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-title">
            <UserOutlined style={{ marginRight: 8 }} />
            {title}
          </div>
          <HeaderRight />
        </Header>
        <Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/my/reservations" element={isReader ? <MyReservationsPage /> : <Navigate to="/forbidden" replace />} />
            <Route path="/my/messages" element={isReader ? <MyMessagesPage /> : <Navigate to="/forbidden" replace />} />
            <Route path="/loans" element={isReader ? <LoansPage /> : <Navigate to="/forbidden" replace />} />
            <Route path="/admin/reservations" element={isAdmin ? <AdminReservationsPage /> : <Navigate to="/forbidden" replace />} />
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
