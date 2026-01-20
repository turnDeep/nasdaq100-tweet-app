import React, { useState } from 'react';
import { logoutUser } from '../services/auth';

const UserMenu = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    await logoutUser();
    onLogout();
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          overflow: 'hidden',
          cursor: 'pointer',
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
        }}
      >
        <img
          src={user.profile_image}
          alt={user.username}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '0',
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          padding: '0.5rem',
          minWidth: '150px',
          zIndex: 1000
        }}>
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6', marginBottom: '0.5rem' }}>
            <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{user.username}</p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '0.5rem',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#ef4444',
              borderRadius: '0.25rem'
            }}
            onMouseOver={(e) => e.target.style.background = '#fef2f2'}
            onMouseOut={(e) => e.target.style.background = 'none'}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
