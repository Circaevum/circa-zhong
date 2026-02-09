import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { nakamaService } from '../services/nakama';

export default function LoginModal({ isOpen, onClose, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (isNewUser = false) => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Pass create=true for signup, create=false for login
      const session = await nakamaService.authenticateEmail(email, password, isNewUser, username || undefined);
      onAuthenticated(session, 'email');
      onClose();
    } catch (err) {
      setError(err.message || 'Email authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'rgba(20, 20, 30, 0.95)',
            padding: '30px',
            borderRadius: '12px',
            minWidth: '400px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <h2 style={{ margin: '0 0 20px 0', color: '#fff' }}>Login to Sync</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '20px' }}>
            Sign in with your email to enable cloud sync across devices.
          </p>
          
          <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderRadius: '6px'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderRadius: '6px'
                }}
              />
              <input
                type="text"
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderRadius: '6px'
                }}
              />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleEmailLogin(false)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: loading ? '#555' : 'var(--accent-gold)',
                    color: loading ? '#aaa' : '#000',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
                <button
                  onClick={() => handleEmailLogin(true)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: loading ? '#555' : 'rgba(255,255,255,0.1)',
                    color: loading ? '#aaa' : '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Sign Up
                </button>
              </div>
            </div>

          {error && (
            <div style={{
              marginTop: '15px',
              padding: '10px',
              background: 'rgba(255,0,0,0.2)',
              border: '1px solid rgba(255,0,0,0.5)',
              borderRadius: '6px',
              color: '#ff6b6b',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              marginTop: '15px',
              width: '100%',
              padding: '8px',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
