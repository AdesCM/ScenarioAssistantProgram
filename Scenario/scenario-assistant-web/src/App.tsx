import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { UniverseProvider } from './contexts/UniverseContext';
import Layout from './components/Layout';
import MainPage from './pages/MainPage';
import UniverseDashboard from './pages/UniverseDashboard';
import ItemDetail from './pages/ItemDetail';
import TimelineView from './pages/TimelineView';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <ThemeProvider>
      <UniverseProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<MainPage />} />
              <Route path="universe/:id" element={<UniverseDashboard />} />
              <Route path="universe/:id/character/:itemId" element={<ItemDetail type="character" />} />
              <Route path="universe/:id/location/:itemId" element={<ItemDetail type="location" />} />
              <Route path="universe/:id/plot/:itemId" element={<ItemDetail type="plot" />} />
              <Route path="universe/:id/timeline" element={<TimelineView />} />
            </Route>
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </BrowserRouter>
      </UniverseProvider>
    </ThemeProvider>
  );
}

export default App;
