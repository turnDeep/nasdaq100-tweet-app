import React, { useState } from 'react';
import { registerUser, loginUser } from '../services/auth';

const Auth = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result); // Base64 string
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let user;
      if (isRegister) {
        if (!image) {
          setError('プロフィール画像が必要です');
          setLoading(false);
          return;
        }
        user = await registerUser(username, image);
      } else {
        user = await loginUser(username);
      }
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f3f4f6'
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
        <h2 style={{ marginBottom: '1.5rem', color: '#1f2937' }}>
          {isRegister ? '新規登録' : 'ログイン'}
        </h2>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  background: '#e5e7eb',
                  margin: '0 auto 1rem',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '2px solid #2cbfc7'
                }}
                onClick={() => document.getElementById('profile-upload').click()}
              >
                {preview ? (
                  <img src={preview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '2rem', color: '#9ca3af' }}>+</span>
                )}
              </div>
              <input
                id="profile-upload"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
              <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>プロフィール画像をタップして選択</p>
            </div>
          )}

          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ユーザー名"
            required
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
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#2cbfc7',
              color: 'white',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              opacity: loading ? 0.7 : 1,
              marginBottom: '1rem'
            }}
          >
            {loading ? '処理中...' : (isRegister ? 'パスキーで登録' : 'パスキーでログイン')}
          </button>
        </form>

        <button
          onClick={() => {
            setIsRegister(!isRegister);
            setError('');
            setPreview(null);
            setImage(null);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          {isRegister ? 'すでにアカウントをお持ちの方はこちら' : '新規登録はこちら'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
