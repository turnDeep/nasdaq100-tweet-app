import axios from 'axios';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export const checkGate = async (password) => {
  try {
    const res = await api.post('/api/auth/gate', { password });
    return res.data.success;
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Gate verification failed');
  }
};

export const registerUser = async (username, imageData) => {
  try {
    // 1. Get registration options
    const optionsRes = await api.post('/api/auth/register/options', { username });
    const { options, user_id } = optionsRes.data;

    // 2. Passkey creation (WebAuthn)
    const attResp = await startRegistration(options);

    // 3. Verify registration
    const verifyRes = await api.post('/api/auth/register/verify', {
      username,
      user_id,
      response: attResp,
      image_data: imageData
    });

    return verifyRes.data.user;
  } catch (error) {
    console.error(error);
    throw new Error(error.response?.data?.detail || 'Registration failed');
  }
};

export const loginUser = async (username) => {
  try {
    // 1. Get login options
    const optionsRes = await api.post('/api/auth/login/options', { username });
    const options = optionsRes.data;

    // 2. Passkey authentication
    const asseResp = await startAuthentication(options);

    // 3. Verify authentication
    const verifyRes = await api.post('/api/auth/login/verify', {
      username,
      response: asseResp
    });

    return verifyRes.data.user;
  } catch (error) {
    console.error(error);
    throw new Error(error.response?.data?.detail || 'Login failed');
  }
};

export const getCurrentUser = async () => {
  try {
    const res = await api.get('/api/auth/me');
    return res.data;
  } catch (error) {
    return null;
  }
};

export const logoutUser = async () => {
  try {
    await api.post('/api/auth/logout');
    return true;
  } catch (error) {
    return false;
  }
};
