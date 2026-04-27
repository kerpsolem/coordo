import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlanningGlobal from './pages/PlanningGlobal';
import PlanningMacro from './pages/PlanningMacro';
import PlanningPromotion from './pages/PlanningPromotion';
import PlanningFormateur from './pages/PlanningFormateur';
import AttributionCopies from './pages/AttributionCopies';
import RecapHeures from './pages/RecapHeures';
import CoordinationPlanning from './pages/CoordinationPlanning';
import Coordination from './pages/Coordination';
import Vacances from './pages/Vacances';
import Alertes from './pages/Alertes';
import AbsencesFormateurs from './pages/AbsencesFormateurs';
import PenseBetes from './pages/PenseBetes';
import Administration from './pages/Administration';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><div className="text-slate-500">Chargement...</div></div>;
  if (!user) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/planning-global" element={<ProtectedRoute><PlanningGlobal /></ProtectedRoute>} />
          <Route path="/planning-macro" element={<ProtectedRoute><PlanningMacro /></ProtectedRoute>} />
          <Route path="/par-promotion" element={<ProtectedRoute><PlanningPromotion /></ProtectedRoute>} />
          <Route path="/par-formateur" element={<ProtectedRoute><PlanningFormateur /></ProtectedRoute>} />
          <Route path="/attribution-copies" element={<ProtectedRoute><AttributionCopies /></ProtectedRoute>} />
          <Route path="/recap-heures" element={<ProtectedRoute><RecapHeures /></ProtectedRoute>} />
          <Route path="/coordination-planning" element={<ProtectedRoute><CoordinationPlanning /></ProtectedRoute>} />
          <Route path="/coordination" element={<ProtectedRoute><Coordination /></ProtectedRoute>} />
          <Route path="/vacances" element={<ProtectedRoute><Vacances /></ProtectedRoute>} />
          <Route path="/alertes" element={<ProtectedRoute><Alertes /></ProtectedRoute>} />
          <Route path="/absences-formateurs" element={<ProtectedRoute><AbsencesFormateurs /></ProtectedRoute>} />
          <Route path="/pense-betes" element={<ProtectedRoute><PenseBetes /></ProtectedRoute>} />
          <Route path="/administration" element={<ProtectedRoute><Administration /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
