import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import authService from '../../services/authService';
import ThemeToggle from '../../components/common/ThemeToggle';
import SpaceBackground from './components/SpaceBackground';
import { ShieldCheck, Key, Lock, CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing password reset token.');
      return;
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to reset password. The link may have expired.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-root">
      <SpaceBackground />
      {/* Background Decorative Grid */}
      <div className="login-bg-overlay" />

      {/* Top Header / Brand */}
      <header className="login-nav" style={{ position: 'relative', zIndex: 1 }}>
        <div className="login-nav-brand">
          <div className="login-logo-badge">
            <ShieldCheck size={22} className="text-primary" />
          </div>
          <div className="login-brand-text">
            <span className="login-brand-title">EGSE MISSION CONTROL</span>
            <span className="login-brand-sub">Satellite Ground Support Equipment</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Container */}
      <main className="login-main" style={{ position: 'relative', zIndex: 1 }}>
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <div className="login-header-icon">
              <Key size={28} className="text-primary" />
            </div>
            <h1 className="login-title">Reset Your Password</h1>
            <p className="login-desc">
              Please enter a strong new password (minimum 10 characters) for your mission control account.
            </p>
          </div>

          {/* Success State */}
          {success ? (
            <div className="login-success-view">
              <div className="login-status-badge success">
                <CheckCircle size={32} />
              </div>
              <h2 className="login-success-title">Password Reset Complete!</h2>
              <p className="login-success-text">
                Your password has been securely updated. You can now access your account with the new credentials.
              </p>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => navigate('/login')}
              >
                Proceed to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              {/* Error Message */}
              {error && (
                <div className="login-alert error" role="alert">
                  <AlertCircle size={18} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* New Password Input */}
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">
                  New Password <span className="text-muted">(Min 10 characters)</span>
                </label>
                <div className="input-wrapper">
                  <Lock size={16} className="input-icon" />
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="form-input"
                    required
                    minLength={10}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">
                  Confirm New Password
                </label>
                <div className="input-wrapper">
                  <Lock size={16} className="input-icon" />
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="form-input"
                    required
                    minLength={10}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Resetting Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>

              {/* Back to Login link */}
              <div className="login-footer">
                <Link to="/login" className="login-link flex items-center justify-center gap-1">
                  <ArrowLeft size={16} />
                  <span>Back to Login</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
