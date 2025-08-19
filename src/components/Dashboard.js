// components/Dashboard.js
import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchData, insertData, updateData, deleteData } from '../lib/supabase'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Sample state for demonstration - replace with your actual data structure
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    status: 'pending'
  })

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">🦄</span>
              <h1 className="text-2xl font-bold text-gray-900">Unicorn Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                Welcome, {user?.user_metadata?.full_name || user?.email}
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Add New Item Form */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h2>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={newItem.title}
                  onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter title..."
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={newItem.description}
                  onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter description..."
                />
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  id="status"
                  value={newItem.status}
                  onChange={(e) => setNewItem(prev => ({ ...prev, status: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
              >
                Add Item
              </button>
            </form>
          </div>

          {/* Data Display */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Your Data</h2>
            </div>
            <div className="p-6">
              {data.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No data found. Add some items to get started!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-gray-900">{item.title}</h3>
                          {item.description && (
                            <p className="mt-1 text-gray-600">{item.description}</p>
                          )}
                          <div className="mt-2 flex items-center space-x-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.status === 'completed' ? 'bg-green-100 text-green-800' :
                              item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                            {item.created_at && (
                              <span className="text-sm text-gray-500">
                                Created: {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdateItem(item.id, { 
                              status: item.status === 'completed' ? 'pending' : 'completed' 
                            })}
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                          >
                            Toggle Status
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Dashboard