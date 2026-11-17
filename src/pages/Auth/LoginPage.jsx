import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, forgotPassword, clearAuthError } from '../../redux/slices/authSlice';
import authService from '../../services/authService';
import ThemeToggle from '../../components/common/ThemeToggle';
import SpaceBackground from './components/SpaceBackground';
import StaticSpaceBackground from './components/StaticSpaceBackground';
import { ANIMATED_SPACE_BACKGROUND } from '../../config/background';
import {
  ShieldCheck,
  UserPlus,
  Mail,
  Key,
  Satellite,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, statusMessage } = useSelector((state) => state.auth);

  // Modes: 'login' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    dispatch(clearAuthError());
    setLocalError('');
    setLocalSuccess('');
  }, [mode, dispatch]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }
    setLocalError('');
    const result = await dispatch(loginUser({ email: email.trim(), password }));
    if (!result.error) {
      navigate('/dashboard');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess('');

    if (!name.trim()) {
      setLocalError('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Email address is required.');
      return;
    }
    if (password.length < 10) {
      setLocalError('Password must be at least 10 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      await authService.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setLocalSuccess('Account created successfully! You can now log in.');
      setMode('login');
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || 'Registration failed');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setLocalError('Please enter your account email.');
      return;
    }
    setLocalError('');
    await dispatch(forgotPassword(email.trim()));
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess('');

    if (!resetToken.trim()) {
      setLocalError('Reset token is required.');
      return;
    }
    if (password.length < 10) {
      setLocalError('New password must be at least 10 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      const res = await authService.resetPassword(resetToken.trim(), password);
      setLocalSuccess(res.data?.message || 'Password reset successfully! Please log in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setResetToken('');
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || 'Password reset failed');
    }
  };

  return (
    <div className="egse-auth-screen position-relative px-3 py-4 overflow-hidden">
      {/* Interactive orbital background (follows the mouse) */}
      {ANIMATED_SPACE_BACKGROUND ? <SpaceBackground /> : <StaticSpaceBackground />}

      <div className="position-absolute top-0 end-0 m-3 d-flex align-items-center gap-2 z-3">
        <ThemeToggle />
      </div>

      <div
        className="egse-panel p-4 p-md-5"
        style={{ width: 'min(460px, 94vw)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
      >
        <div className="text-center mb-4">
          <div
            className="d-inline-flex p-3 rounded-circle mb-2"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, rgba(6, 182, 212, 0.02) 70%)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              boxShadow: '0 0 24px rgba(6, 182, 212, 0.2)',
            }}
          >
            <Satellite className="text-info" size={36} />
          </div>
          <h1 className="egse-heading h4 mt-2 mb-1" style={{ letterSpacing: '0.8px' }}>
            EGSA ANALYSIS PLATFORM
          </h1>
          <div className="d-flex align-items-center justify-content-center gap-2 mb-1">

          </div>
          <p className="small mb-0" style={{ color: 'var(--egse-text-secondary)' }}>
            Satellite Ground Support Equipment
          </p>
        </div>

        {/* Global Error Alert */}
        {(error || localError) && (
          <div className="egse-chip egse-chip-alarm w-100 justify-content-center mb-3 py-2 text-center">
            <AlertCircle size={15} className="me-1" /> {error || localError}
          </div>
        )}

        {/* Status / Success Messages */}
        {(statusMessage || localSuccess) && (
          <div className="egse-chip egse-chip-nominal w-100 justify-content-center mb-3 py-2 text-center">
            <CheckCircle size={15} className="me-1" /> {statusMessage || localSuccess}
          </div>
        )}

        {/* ─── Mode 1: LOGIN ─── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small d-flex align-items-center gap-1 text-muted">
                <Mail size={14} />  Email
              </label>
              <input
                type="email"
                className="form-control egse-field"
                placeholder="dev@egse.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small mb-0 d-flex align-items-center gap-1 text-muted">
                  <Key size={14} /> Password
                </label>
                <button
                  type="button"
                  className="btn btn-link p-0 small text-decoration-none"
                  style={{ color: 'var(--egse-raw)', fontSize: '0.8rem' }}
                  onClick={() => setMode('forgot')}
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                className="form-control egse-field"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-egse-primary w-100 mt-2 d-flex align-items-center justify-content-center gap-2"
              disabled={isLoading}
              style={{ height: '42px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="spinner-border spinner-border-sm" size={16} /> Authenticating...
                </>
              ) : (
                <>
                  <ShieldCheck size={18} /> Enter Mission Ops
                </>
              )}
            </button>

            {/* <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary border-opacity-25">
              <button
                type="button"
                className="btn btn-link p-0 small text-decoration-none text-info"
                onClick={() => setMode('register')}
              >
                + Register New Account
              </button>

            </div> */}
          </form>
        )}

        {/* ─── Mode 2: REGISTER ─── */}
        {/* {mode === 'register' && (
          <form onSubmit={handleRegister} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small text-muted">
                <User size={14} className="me-1" /> Full Name *
              </label>
              <input
                type="text"
                required
                className="form-control egse-field"
                placeholder="e.g. Alex Mercer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted">
                <Mail size={14} className="me-1" /> Email Address *
              </label>
              <input
                type="email"
                required
                className="form-control egse-field"
                placeholder="operator@egse.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted">
                <Key size={14} className="me-1" /> Password * (&ge;10 characters)
              </label>
              <input
                type="password"
                required
                minLength={10}
                className="form-control egse-field"
                placeholder="Minimum 10 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted">Confirm Password *</label>
              <input
                type="password"
                required
                minLength={10}
                className="form-control egse-field"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-egse-primary w-100 mt-2">
              <UserPlus size={16} className="me-1" /> Create Account
            </button>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline w-100"
              onClick={() => setMode('login')}
            >
              ← Back to Login
            </button>
          </form>
        )} */}

        {/* ─── Mode 3: FORGOT PASSWORD ─── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="d-flex flex-column gap-3">
            <p className="small text-secondary mb-0">
              Enter your registered email address. If an account exists, a password reset token will be dispatched securely.
            </p>
            <div>
              <label className="form-label small text-muted">Account Email</label>
              <input
                type="email"
                required
                className="form-control egse-field"
                placeholder="operator@egse.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-egse-primary w-100" disabled={isLoading}>
              {isLoading ? 'Dispatching link...' : 'Send Reset Link'}
            </button>

            <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary border-opacity-25">
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-secondary p-0"
                onClick={() => setMode('login')}
              >
                ← Back to Login
              </button>
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-info p-0"
                onClick={() => setMode('reset')}
              >
                Already have token?
              </button>
            </div>
          </form>
        )}

        {/* ─── Mode 4: RESET PASSWORD WITH TOKEN ─── */}
        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="d-flex flex-column gap-3">
            <p className="small text-secondary mb-0">
              Enter the reset token along with your new password to restore access to your account.
            </p>
            <div>
              <label className="form-label small text-muted">Reset Token *</label>
              <input
                type="text"
                required
                className="form-control egse-field"
                placeholder="Paste reset token here"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted">New Password * (&ge;10 characters)</label>
              <input
                type="password"
                required
                minLength={10}
                className="form-control egse-field"
                placeholder="Minimum 10 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted">Confirm New Password *</label>
              <input
                type="password"
                required
                minLength={10}
                className="form-control egse-field"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-egse-primary w-100 mt-2">
              <Lock size={15} className="me-1" /> Reset Password
            </button>

            <button
              type="button"
              className="btn btn-sm btn-egse-outline w-100"
              onClick={() => setMode('login')}
            >
              ← Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
