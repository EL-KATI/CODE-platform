import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './context/store.js'
import Layout from './components/layout/Layout.jsx'
import Spinner from './components/ui/Spinner.jsx'

// Lazy-loaded pages
const Home        = lazy(() => import('./pages/Home.jsx'))
const Login       = lazy(() => import('./pages/Login.jsx'))
const Register    = lazy(() => import('./pages/Register.jsx'))
const ForgotPwd   = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPwd    = lazy(() => import('./pages/ResetPassword.jsx'))
const Dashboard   = lazy(() => import('./pages/Dashboard.jsx'))
const Lessons     = lazy(() => import('./pages/Lessons.jsx'))
const LessonView  = lazy(() => import('./pages/LessonView.jsx'))
const Practice    = lazy(() => import('./pages/Practice.jsx'))
const Quiz        = lazy(() => import('./pages/Quiz.jsx'))
const Results     = lazy(() => import('./pages/Results.jsx'))
const Mistakes    = lazy(() => import('./pages/Mistakes.jsx'))
const Profile     = lazy(() => import('./pages/Profile.jsx'))
const Live        = lazy(() => import('./pages/Live.jsx'))
const Champion    = lazy(() => import('./pages/Champion.jsx'))
const Bookings    = lazy(() => import('./pages/Bookings.jsx'))
const AiTutor     = lazy(() => import('./pages/AiTutor.jsx'))
const Exams       = lazy(() => import('./pages/Exams.jsx'))
const Admin       = lazy(() => import('./pages/Admin.jsx'))
const Schools     = lazy(() => import('./pages/Schools.jsx'))
const Privacy     = lazy(() => import('./pages/Privacy.jsx'))
const NotFound    = lazy(() => import('./pages/NotFound.jsx'))

function RequireAuth({ children }) {
  const { user, loading } = useStore()
  if (loading) return <Spinner full />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, loading } = useStore()
  if (loading) return <Spinner full />
  if (!user) return <Navigate to="/login" replace />
  if (!['admin', 'school', 'instructor'].includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const loadUser = useStore(s => s.loadUser)

  useEffect(() => { loadUser() }, [loadUser])

  return (
    <Suspense fallback={<Spinner full />}>
      <Routes>
        <Route element={<Layout />}>
          {/* Public */}
          <Route path="/"           element={<Home />} />
          <Route path="/login"      element={<Login />} />
          <Route path="/register"   element={<Register />} />
          <Route path="/forgot"     element={<ForgotPwd />} />
          <Route path="/reset"      element={<ResetPwd />} />
          <Route path="/privacy"    element={<Privacy />} />
          <Route path="/champion"   element={<Champion />} />

          {/* Authenticated */}
          <Route path="/dashboard"  element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/lessons"    element={<RequireAuth><Lessons /></RequireAuth>} />
          <Route path="/lessons/:id" element={<RequireAuth><LessonView /></RequireAuth>} />
          <Route path="/practice"   element={<RequireAuth><Practice /></RequireAuth>} />
          <Route path="/quiz"       element={<RequireAuth><Quiz /></RequireAuth>} />
          <Route path="/results/:id" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/mistakes"   element={<RequireAuth><Mistakes /></RequireAuth>} />
          <Route path="/profile"    element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/live/:id"   element={<RequireAuth><Live /></RequireAuth>} />
          <Route path="/bookings"   element={<RequireAuth><Bookings /></RequireAuth>} />
          <Route path="/ai"         element={<RequireAuth><AiTutor /></RequireAuth>} />
          <Route path="/exams"      element={<RequireAuth><Exams /></RequireAuth>} />

          {/* Staff only */}
          <Route path="/admin/*"    element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/schools"    element={<RequireAdmin><Schools /></RequireAdmin>} />

          <Route path="*"           element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
