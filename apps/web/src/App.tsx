import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import Presidente from './pages/Presidente';
import Metodologia from './pages/Metodologia';
const CargoPage = lazy(() => import('./pages/CargoPage'));

export default function App() {
  return (
    <Layout>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Presidente />} />
          <Route path="/governador" element={<CargoPage cargo="governador" />} />
          <Route path="/senador" element={<CargoPage cargo="senador" />} />
          <Route path="/metodologia" element={<Metodologia />} />
          <Route path="*" element={<Presidente />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
