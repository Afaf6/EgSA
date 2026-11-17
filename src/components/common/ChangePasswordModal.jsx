import { useState } from 'react';
import { createPortal } from 'react-dom';
import authService from '../../services/authService';
import { Key, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!currentPassword) {
      setErrorMsg('Current password is required.');
      return;
    }
    if (newPassword.length < 10) {
      setErrorMsg('New password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.changePassword(currentPassword, newPassword);
      setSuccessMsg(res.data?.message || 'Password changed successfully.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  // Rendered into <body>: the topbar that opens it has a backdrop-filter, which would make it the
  // containing block of this fixed overlay and push the panel above the viewport.
  // The overlay scrolls, and margin:auto centres the panel only while it fits, so a short
  // viewport shows it from the top instead of cutting it off.
  return createPortal(
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex p-3"
      style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1060, backdropFilter: 'blur(4px)', overflowY: 'auto' }}
      onClick={onClose}
      data-testid="change-password-overlay"
    >
      <div
        className="egse-panel p-4"
        style={{ width: 'min(440px, 100%)', margin: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-label="Update Security Password"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary border-opacity-25">
          <div className="d-flex align-items-center gap-2">
            <Key size={18} className="text-info" />
            <h3 className="egse-heading h6 mb-0">Update Security Password</h3>
          </div>
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>

        {errorMsg && (
          <div className="alert alert-danger py-2 small mb-3">{errorMsg}</div>
        )}
        {successMsg && (
          <div className="alert alert-success py-2 small mb-3">{successMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-muted">Current Password</label>
            <div className="input-group">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                className="form-control egse-field"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-egse-outline"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="form-label small text-muted">New Password (&ge;10 characters)</label>
            <div className="input-group">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={10}
                className="form-control egse-field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-egse-outline"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="form-label small text-muted">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={10}
              className="form-control egse-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="d-flex justify-content-end gap-2 pt-2 border-top border-secondary border-opacity-25">
            <button type="button" className="btn btn-sm btn-egse-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-egse-primary" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
