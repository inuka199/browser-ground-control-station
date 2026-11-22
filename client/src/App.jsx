import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import './components/views/Workspace.css';
import { initWebSocket, destroyWebSocket } from './services/websocket.js';
import AppShell from './components/layout/AppShell.jsx';
import RouteBoundary from './components/layout/RouteBoundary.jsx';
const LiveStation = lazy(() => import('./components/views/LiveStation.jsx'));
const DashboardView = lazy(() => import('./components/views/DashboardView.jsx'));
const HelpView = lazy(() => import('./components/views/HelpView.jsx'));
const SimulationView = lazy(() => import('./components/views/SimulationView.jsx'));
const ActionView = lazy(() => import('./components/views/ActionView.jsx'));
const SimulatorPage = lazy(() => import('./components/simulator/SimulatorPage.jsx'));
const DroneGarage = lazy(() => import('./components/simulator/DroneGarage.jsx'));
const EnvironmentView = lazy(() => import('./components/views/EnvironmentView.jsx'));
const ChallengesView = lazy(() => import('./components/views/ChallengesView.jsx'));
const GadgetsView = lazy(() => import('./components/views/GadgetsView.jsx'));
const MultiplayerView = lazy(() => import('./components/views/MultiplayerView.jsx'));
const RecordingsView = lazy(() => import('./components/views/RecordingsView.jsx'));
const TrainingView = lazy(() => import('./components/views/TrainingView.jsx'));
const ViewsView = lazy(() => import('./components/views/ViewsView.jsx'));
const NotFoundView = lazy(() => import('./components/views/NotFoundView.jsx'));

export default function App() {
  useEffect(() => { initWebSocket(); return destroyWebSocket; }, []);
  return <BrowserRouter><RouteBoundary><Suspense fallback={<div className="workspace-page" role="status">Loading page…</div>}><Routes>
    <Route path="/simulator" element={<SimulatorPage/>}/>
    <Route path="/garage" element={<DroneGarage/>}/>
    <Route element={<AppShell/>}>
      <Route path="/live" element={<LiveStation/>}/>
      <Route index element={<DashboardView/>}/>
      <Route path="/simulation" element={<SimulationView/>}/>
      <Route path="/action" element={<ActionView/>}/>
      <Route path="/environment" element={<EnvironmentView/>}/>
      <Route path="/challenges" element={<ChallengesView/>}/>
      <Route path="/gadgets" element={<GadgetsView/>}/>
      <Route path="/multiplayer" element={<MultiplayerView/>}/>
      <Route path="/recordings" element={<RecordingsView/>}/>
      <Route path="/training" element={<TrainingView/>}/>
      <Route path="/views" element={<ViewsView/>}/>
      <Route path="/help" element={<HelpView/>}/>
      <Route path="*" element={<NotFoundView/>}/>
    </Route>
  </Routes></Suspense></RouteBoundary></BrowserRouter>;
}

