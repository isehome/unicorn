// components/Dashboard.js
import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchData, insertData, updateData, deleteData } from '../lib/supabase'
import { enhancedStyles } from '../styles/styleSystem'
import { useTheme } from '../contexts/ThemeContext'
import { Calendar, Users, Activity, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import Button from './ui/Button'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const { theme, mode } = useTheme()
  const sectionStyles = enhancedStyles.sections[mode]
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Sample state for demonstration - replace with your actual data structure
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    status: 'pending'
  })

  const getProgressColor = (percentage) => {
    if (percentage === 100) return '#8B5CF6';
    if (percentage >= 76) return '#10B981';
    if (percentage >= 51) return '#3B82F6';
    if (percentage >= 26) return '#F59E0B';
    return '#EF4444';
  };

  const getStatusIcon = (percentage) => {
    if (percentage === 100) return <CheckCircle className="w-4 h-4" />;
    if (percentage >= 50) return <Activity className="w-4 h-4" />;
    if (percentage > 0) return <Clock className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  // Sample projects data
  const projects = [
    { name: 'Network Infrastructure', progress: 85 },
    { name: 'Security System Install', progress: 60 },
    { name: 'Server Migration', progress: 100 },
    { name: 'WiFi Deployment', progress: 25 }
  ];

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Replace 'your_table_name' with your actual table name
      const result = await fetchData('your_table_name')
      setData(result || [])
    } catch (error) {
      setError('Failed to load data')
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    
    if (!newItem.title.trim()) {
      setError('Title is required')
      return
    }

    try {
      setError('')
      
      const itemToAdd = {
        ...newItem,
        user_id: user.id,
        created_at: new Date().toISOString()
      }
      
      // Replace 'your_table_name' with your actual table name
      const result = await insertData('your_table_name', itemToAdd)
      
      if (result && result.length > 0) {
        setData(prevData => [...prevData, result[0]])
        setNewItem({ title: '', description: '', status: 'pending' })
      }
    } catch (error) {
      setError('Failed to add item')
      console.error('Error adding item:', error)
    }
  }

  const handleUpdateItem = async (id, updates) => {
    try {
      setError('')
      
      // Replace 'your_table_name' with your actual table name
      const result = await updateData('your_table_name', id, updates)
      
      if (result && result.length > 0) {
        setData(prevData =>
          prevData.map(item =>
            item.id === id ? result[0] : item
          )
        )
      }
    } catch (error) {
      setError('Failed to update item')
      console.error('Error updating item:', error)
    }
  }

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
      return
    }

    try {
      setError('')
      
      // Replace 'your_table_name' with your actual table name
      await deleteData('your_table_name', id)
      setData(prevData => prevData.filter(item => item.id !== id))
    } catch (error) {
      setError('Failed to delete item')
      console.error('Error deleting item:', error)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <h2 className="mt-4 text-lg font-medium text-gray-900">
            Loading dashboard...
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div style={sectionStyles.header}>
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text text-transparent">
            Technician Dashboard
          </h1>
          <Button variant="primary">
            Switch to PM
          </Button>
        </div>
      </div>

      <div className="p-6">
        <div style={sectionStyles.card} className="hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Calendar className="w-5 h-5 text-violet-500" />
              </div>
              <h2 className="text-xl font-semibold">Today's Schedule</h2>
            </div>
          </div>
        </div>

        <div style={sectionStyles.sectionDivider}></div>

        <div style={sectionStyles.card}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Users className="w-5 h-5 text-violet-500" />
            </div>
            <h2 className="text-xl font-semibold">My Projects</h2>
          </div>

          {projects.map((project, index) => (
            <div 
              key={index}
              style={{
                ...sectionStyles.projectCard,
                borderLeftColor: getProgressColor(project.progress)
              }}
              className="hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div style={{ color: getProgressColor(project.progress) }}>
                    {getStatusIcon(project.progress)}
                  </div>
                  <h3 className="font-semibold text-lg">{project.name}</h3>
                  <span 
                    className="px-2 py-1 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: `${getProgressColor(project.progress)}20`,
                      color: getProgressColor(project.progress),
                      border: `1px solid ${getProgressColor(project.progress)}40`
                    }}
                  >
                    {project.progress}%
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${project.progress}%`,
                      background: getProgressColor(project.progress),
                      boxShadow: `0 0 10px ${getProgressColor(project.progress)}40`
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1 text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20">
                  OPEN
                </Button>
                <Button variant="secondary" size="sm" className="flex-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20">
                  ISSUES
                </Button>
                <Button variant="secondary" size="sm" className="flex-1 text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20">
                  CHECK IN
                </Button>
                <Button variant="secondary" size="sm" className="flex-1 text-gray-600 dark:text-gray-400 bg-gray-500/10 hover:bg-gray-500/20">
                  CHECK OUT
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dashboard