import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState(() => {
    const savedEmail = localStorage.getItem('nexum_email');
    return savedEmail || '';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    const saved = localStorage.getItem('nexum_rememberMe');
    return saved === 'true';
  });
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setLoading(true);
      const res = await api.post('/auth/login', { email, password });
      const token = res.data?.data?.access_token || res.data?.data?.token;
      if (!token) throw new Error('Missing token in response');
      // Always store in localStorage for app-wide access
      localStorage.setItem('nexum_token', token);
      const userData = res.data?.data?.user;
      if (userData) {
        localStorage.setItem('nexum_user', JSON.stringify(userData));
      }
      // Save email only when Remember Me is checked
      if (rememberMe) {
        localStorage.setItem('nexum_email', email);
      } else {
        localStorage.removeItem('nexum_email');
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'radial-gradient(circle, rgba(19, 29, 48, 0.91) 0%, rgba(41, 46, 59, 0.95) 51%)' }}>
        
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-sky-500 via-sky-600 to-sky-700 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/30">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight">NexumDesk</span>
            </div>
          </div>
          
          <div className="space-y-8">
            <h1 className="text-5xl font-bold leading-tight">
              Enterprise Incident Management and Automation Platform
            </h1>
            <p className="text-lg text-gray-400 font-semibold max-w-md leading-relaxed">
              Resolve incidents faster with automation and a seamless experience for modern teams.
            </p>
            
            <div className="flex items-center gap-4 pt-4">
              <div className="flex -space-x-3">
                {/* Efficient: Lightning bolt */}
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h7v8l7-12h-7V2z" />
                  </svg>
                </div>
                {/* Reliable: Lock */}
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="7" y="11" width="10" height="7" rx="2" />
                    <path d="M12 11V7a4 4 0 018 0v4" />
                  </svg>
                </div>
                {/* Collaborative: Chat bubbles */}
                <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-white/80 font-semibold ml-1">Efficient. Reliable. Collaborative.</p>
            </div>
          </div>

          <div className="text-sm text-white/50">
            © 2026 NexumDesk. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/25">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-gradient">NexumDesk</span>
            </div>
          </div>

          <div className="bg-white rounded-none shadow-card-hover p-8 border border-neutral-100 relative z-20">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-neutral-800 tracking-tight">Welcome back</h2>
              <p className="text-neutral-500 mt-2">Sign in to your account to continue</p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-slide-down">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Email</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      // Actualizează emailul în localStorage dacă Remember Me e bifat
                      if (rememberMe) {
                        localStorage.setItem('nexum_email', e.target.value);
                      }
                    }}
                    required
                    className="input pl-11"
                  />
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center text-sm text-neutral-600 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="checkbox mr-2"
                    checked={rememberMe}
                    onChange={e => {
                      setRememberMe(e.target.checked);
                      localStorage.setItem('nexum_rememberMe', e.target.checked ? 'true' : 'false');
                    }}
                  />
                  <span className="group-hover:text-neutral-800 transition-colors">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                  onClick={() => alert('Please contact your organization administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-action-reopen w-full py-3.5 font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-base"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="spinner"></span>
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
              <p className="text-xs text-neutral-400 text-center mt-3">Your credentials are securely encrypted.</p>
            </form>

            {/* ...existing code... */}

            {/* ...existing code... */}
          </div>
        </div>
      </div>
    </div>
  );
}
