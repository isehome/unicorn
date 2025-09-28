import React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AuthCallback from './components/AuthCallback'
import Login from './components/Login'
import LoginDebug from './components/Login.debug'
import MyProjectsDebug from './components/MyProjectsDebug'
import App from './App'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/login-debug', element: <LoginDebug /> },
  { path: '/my-projects-debug', element: (
      <ProtectedRoute>
        <MyProjectsDebug />
      </ProtectedRoute>
    )
  },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/', element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    )
  }
])

export default function AppRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
