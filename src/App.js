import React, { useState, useEffect } from 'react';
import './App.css';

// Make sure this is a functional component, not a class component
function App() {
  // All hooks must be at the top level of the component
  // Never inside loops, conditions, or nested functions
  const [unicorns, setUnicorns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newUnicornName, setNewUnicornName] = useState('');
  const [showForm, setShowForm] = useState(false);

  // useEffect hook should be at the top level
  useEffect(() => {
    // This is the correct place for initialization logic
    initializeApp();
  }, []); // Empty dependency array means this runs once on mount

  // Helper functions should be defined after hooks but before return
  const initializeApp = async () => {
    setLoading(true);
    try {
      // Example: fetch initial data
      const response = await fetch('/api/unicorns');
      if (response.ok) {
        const data = await response.json();
        setUnicorns(data);
      }
    } catch (err) {
      setError('Failed to load unicorns');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUnicorn = (e) => {
    e.preventDefault();
    
    if (!newUnicornName.trim()) {
      return;
    }

    const newUnicorn = {
      id: Date.now(),
      name: newUnicornName,
      color: getRandomColor(),
      created: new Date().toISOString()
    };

    // Correct way to update state
    setUnicorns(prevUnicorns => [...prevUnicorns, newUnicorn]);
    setNewUnicornName('');
    setShowForm(false);
  };

  const handleDeleteUnicorn = (id) => {
    setUnicorns(prevUnicorns => prevUnicorns.filter(unicorn => unicorn.id !== id));
  };

  const getRandomColor = () => {
    const colors = ['purple', 'pink', 'blue', 'rainbow', 'white', 'gold'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Conditional rendering should be in the return statement
  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <h2>? Loading magical unicorns...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>? {error}</h2>
          <button onClick={initializeApp}>Try Again</button>
        </div>
      </div>
    );
  }

  // Main component render - this must return JSX
  return (
    <div className="app">
      <header className="app-header">
        <h1>? Magical Unicorn App</h1>
        <p>Welcome to the most magical unicorn tracker!</p>
      </header>

      <main className="app-main">
        <div className="unicorn-controls">
          <button 
            onClick={() => setShowForm(!showForm)}
            className="toggle-form-btn"
          >
            {showForm ? 'Cancel' : 'Add New Unicorn'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddUnicorn} className="unicorn-form">
            <div className="form-group">
              <label htmlFor="unicornName">Unicorn Name:</label>
              <input
                id="unicornName"
                type="text"
                value={newUnicornName}
                onChange={(e) => setNewUnicornName(e.target.value)}
                placeholder="Enter unicorn name..."
                required
              />
            </div>
            <button type="submit" className="submit-btn">
              ? Create Unicorn
            </button>
          </form>
        )}

        <div className="unicorn-list">
          {unicorns.length === 0 ? (
            <div className="empty-state">
              <h3>No unicorns yet!</h3>
              <p>Add your first magical unicorn to get started.</p>
            </div>
          ) : (
            <div className="unicorn-grid">
              {unicorns.map((unicorn) => (
                <div key={unicorn.id} className="unicorn-card">
                  <div className="unicorn-emoji">?</div>
                  <h3>{unicorn.name}</h3>
                  <p className="unicorn-color">Color: {unicorn.color}</p>
                  <p className="unicorn-date">
                    Created: {new Date(unicorn.created).toLocaleDateString()}
                  </p>
                  <button 
                    onClick={() => handleDeleteUnicorn(unicorn.id)}
                    className="delete-btn"
                    aria-label={`Delete ${unicorn.name}`}
                  >
                    ?? Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>Made with ? and ? by Unicorn Enthusiasts</p>
      </footer>
    </div>
  );
}

export default App;