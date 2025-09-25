import React, { createContext, useContext } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  // Immediate values - no async loading
  const user = { id: 'demo-user', email: 'demo@example.com' }
  const loading = false

  console.log('✅ AuthProvider: BYPASS MODE - no loading!')

  const login = async () => {
    console.log('Demo login')
  }

  const logout = async () => {
    console.log('Demo logout')
  }

  const value = { user, loading, login, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)