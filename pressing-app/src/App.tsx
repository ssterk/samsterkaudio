import type { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./lib/auth-client";
import { AppShell } from "./components/AppShell";
import { Login } from "./routes/Login";
import { Library } from "./routes/Library";
import { ReleaseDetail } from "./routes/ReleaseDetail";
import { ImportDropbox } from "./routes/ImportDropbox";
import { AcceptInvite } from "./routes/AcceptInvite";
import { InviteComplete } from "./routes/InviteComplete";

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/invite/:token/complete" element={<InviteComplete />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Library />} />
        <Route path="releases/:id" element={<ReleaseDetail />} />
        <Route path="import" element={<ImportDropbox />} />
      </Route>
    </Routes>
  );
}
