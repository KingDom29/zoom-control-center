import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Meetings from './pages/Meetings';
import Users from './pages/Users';
import Recordings from './pages/Recordings';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Webhooks from './pages/Webhooks';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/users" element={<Users />} />
          <Route path="/recordings" element={<Recordings />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/webhooks" element={<Webhooks />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
