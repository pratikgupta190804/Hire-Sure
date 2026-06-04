import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useRoute } from "./hooks/useRoute";
import { useToast } from "./hooks/useToast";
import { matchRoute } from "./utils/router";
import { GlobalStyle } from "./components/GlobalStyle";
import { Navbar } from "./components/Navbar";
import { Toast } from "./components/Toast";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { ProblemsPage } from "./pages/ProblemsPage";
import { ProblemPage } from "./pages/ProblemPage";
import { SubmissionsPage } from "./pages/SubmissionsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { NotFound } from "./pages/NotFound";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminProblemsPage } from "./pages/admin/AdminProblemsPage";
import { ProblemFormPage } from "./pages/admin/ProblemFormPage";
import { AIGeneratorPage } from "./pages/admin/AIGeneratorPage";
import { AdminContestsPage } from "./pages/admin/AdminContestsPage";
import { ContestFormPage } from "./pages/admin/ContestFormPage";

function Router() {
  const { path, navigate } = useRoute();
  const { user, isAdmin } = useAuth();
  const { show, toast, clear } = useToast();

  const routes = [
    { pattern: "/", component: () => <LandingPage navigate={navigate} /> },
    {
      pattern: "/login",
      component: () => <AuthPage navigate={navigate} mode="login" />,
    },
    {
      pattern: "/register",
      component: () => <AuthPage navigate={navigate} mode="register" />,
    },
    {
      pattern: "/problems",
      component: () => <ProblemsPage navigate={navigate} />,
    },
    {
      pattern: "/problems/:slug",
      component: (p) => <ProblemPage navigate={navigate} slug={p.slug} />,
    },
    {
      pattern: "/submissions",
      component: () =>
        user ? (
          <SubmissionsPage navigate={navigate} />
        ) : (
          <AuthPage navigate={navigate} mode="login" />
        ),
    },
    {
      pattern: "/profile",
      component: () =>
        user ? (
          <ProfilePage navigate={navigate} />
        ) : (
          <AuthPage navigate={navigate} mode="login" />
        ),
    },
    {
      pattern: "/admin",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <AdminDashboard navigate={navigate} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/problems",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <AdminProblemsPage navigate={navigate} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/problems/new",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <ProblemFormPage navigate={navigate} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/problems/:id/edit",
      component: (p) =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <ProblemFormPage navigate={navigate} problemId={p.id} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/generate",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <AIGeneratorPage />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/contests",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <AdminContestsPage navigate={navigate} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/contests/new",
      component: () =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <ContestFormPage navigate={navigate} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
    {
      pattern: "/admin/contests/:id/edit",
      component: (p) =>
        isAdmin ? (
          <AdminLayout navigate={navigate} path={path}>
            <ContestFormPage navigate={navigate} contestId={p.id} />
          </AdminLayout>
        ) : (
          <NotFound navigate={navigate} />
        ),
    },
  ];

  let matched = null;
  for (const route of routes) {
    const params = matchRoute(route.pattern, path);
    if (params !== null) {
      matched = route.component(params);
      break;
    }
  }

  return (
    <>
      <GlobalStyle />
      <Navbar navigate={navigate} path={path} />
      {matched || <NotFound navigate={navigate} />}
      {toast && (
        <Toast
          key={toast.id}
          msg={toast.msg}
          type={toast.type}
          onClose={clear}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
