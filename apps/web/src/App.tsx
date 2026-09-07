import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout/Layout";
import { WalletProvider } from "./components/WalletProvider";
import { ToastProvider } from "./components/Toast/ToastProvider";

const Marketplace = lazy(() => import("./pages/Marketplace"));
const WorkflowDetail = lazy(() => import("./pages/WorkflowDetail"));
const Search = lazy(() => import("./pages/Search"));
const Profile = lazy(() => import("./pages/Profile"));
const Register = lazy(() => import("./pages/Register"));
const Execute = lazy(() => import("./pages/Execute"));

export function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route
              element={<Layout />}
            >
              <Route
                path="/"
                element={<Navigate to="/marketplace" replace />}
              />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/marketplace/:workflowId" element={<WorkflowDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/register" element={<Register />} />
              <Route path="/execute/:id" element={<Execute />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </WalletProvider>
  );
}

export default App;