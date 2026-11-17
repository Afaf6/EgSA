import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import authService from '../../services/authService';
import ThemeToggle from '../../components/common/ThemeToggle';
import SpaceBackground from './components/SpaceBackground';
import {
  Key,
  Lock,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isMinLength = password.length >= 10;
  const isMatching = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing password reset token.');
      return;
    }

    if (!isMinLength) {
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
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to reset password. The link may have expired.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="egse-auth-screen position-relative px-3 py-4 overflow-hidden">
      {/* Interactive orbital background */}
      <SpaceBackground />

      {/* Top Header Theme Toggle */}
      <div className="position-absolute top-0 end-0 m-3 d-flex align-items-center gap-2 z-3">
        <ThemeToggle />
      </div>

      {/* Main Glassmorphic Panel */}
      <div
        className="egse-panel p-4 p-md-5"
        style={{
          width: 'min(460px, 94vw)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Header Badge */}
        <div className="text-center mb-4">
          <div
            className="d-inline-flex p-3 rounded-circle mb-2"
            style={{
              background:
                'radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, rgba(6, 182, 212, 0.02) 70%)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              boxShadow: '0 0 24px rgba(6, 182, 212, 0.2)',
            }}
          >
            <Key className="text-info" size={34} />
          </div>
          <h1 className="egse-heading h4 mt-2 mb-1" style={{ letterSpacing: '0.8px' }}>
            RESET PASSWORD
          </h1>
          <p className="small mb-0" style={{ color: 'var(--egse-text-secondary)' }}>
            EGSE Mission Control System
          </p>
        </div>

        {/* Success View */}
        {success ? (
          <div className="text-center py-2">
            <div
              className="d-inline-flex p-3 rounded-circle mb-3"
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                boxShadow: '0 0 20px rgba(34, 197, 94, 0.25)',
              }}
            >
              <CheckCircle className="text-success" size={40} />
            </div>
            <h2 className="egse-heading h5 mb-2">Password Reset Complete!</h2>
            <p
              className="small mb-4"
              style={{ color: 'var(--egse-text-secondary)', lineHeight: 1.6 }}
            >
              Your mission control account password has been securely updated. You can now proceed to
              sign in with your new credentials.
            </p>
            <button
              type="button"
              className="btn btn-egse-primary w-100 py-2"
              onClick={() => navigate('/login')}
            >
              Proceed to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
            {/* Error Message */}
            {error && (
              <div className="egse-chip egse-chip-alarm w-100 justify-content-center py-2 text-center">
                <AlertCircle size={15} className="me-1 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="small mb-1 text-secondary">
              Enter your new password below. It must be at least 10 characters long.
            </p>

            {/* New Password Input */}
            <div>
              <label className="form-label small d-flex align-items-center gap-1 text-muted mb-1">
                <Lock size={14} /> New Password <span className="opacity-75">(&ge;10 chars)</span>
              </label>
              <div className="position-relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="form-control egse-field pe-5"
                  required
                  minLength={10}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-link position-absolute top-50 end-0 translate-middle-y text-secondary p-2 me-1"
                  style={{ border: 'none', background: 'transparent' }}
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className="form-label small d-flex align-items-center gap-1 text-muted mb-1">
                <ShieldCheck size={14} /> Confirm New Password
              </label>
              <div className="position-relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="form-control egse-field pe-5"
                  required
                  minLength={10}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="btn btn-link position-absolute top-50 end-0 translate-middle-y text-secondary p-2 me-1"
                  style={{ border: 'none', background: 'transparent' }}
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Password Validation Hints */}
            {password.length > 0 && (
              <div
                className="p-2 rounded"
                style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid var(--egse-border-subtle, rgba(255,255,255,0.08))',
                  fontSize: '0.78rem',
                }}
              >
                <div
                  className={`d-flex align-items-center gap-1 mb-1 ${
                    isMinLength ? 'text-success' : 'text-muted'
                  }`}
                >
                  {isMinLength ? <Check size={13} /> : <span className="opacity-50">•</span>}
                  <span>At least 10 characters ({password.length}/10)</span>
                </div>
                {confirmPassword.length > 0 && (
                  <div
                    className={`d-flex align-items-center gap-1 ${
                      isMatching ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {isMatching ? <Check size={13} /> : <span className="opacity-50">•</span>}
                    <span>{isMatching ? 'Passwords match' : 'Passwords do not match'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-egse-primary w-100 py-2 mt-2"
              disabled={isLoading || !isMinLength || (confirmPassword.length > 0 && !isMatching)}
            >
              {isLoading ? (
                <span className="d-flex align-items-center justify-content-center gap-2">
                  <Loader2 size={16} className="spinner-border spinner-border-sm" />
                  <span>Updating Password...</span>
                </span>
              ) : (
                <span className="d-flex align-items-center justify-content-center gap-2">
                  <Lock size={15} />
                  <span>Update Password</span>
                </span>
              )}
            </button>

            {/* Back to Login link */}
            <div className="d-flex justify-content-center pt-2 border-top border-secondary border-opacity-25 mt-2">
              <Link
                to="/login"
                className="btn btn-sm btn-link text-decoration-none text-secondary d-flex align-items-center gap-1 p-0"
              >
                <ArrowLeft size={14} />
                <span>Back to Login</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
