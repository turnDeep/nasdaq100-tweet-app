import React, { useState } from 'react';
import { checkGate } from '../services/auth';

const Gate = ({ onPass }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await checkGate(password);
      onPass();
    } catch (err) {
      setError('パスワードが違います');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#2cbfc7'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '1.5rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#1f2937' }}>ゲートパスワード</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              marginBottom: '1rem',
              fontSize: '1rem'
            }}
          />
          {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#2cbfc7',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            次へ
          </button>
        </form>
      </div>
    </div>
  );
};

export default Gate;
