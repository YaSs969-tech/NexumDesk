import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  showClose?: boolean;
  icon?: React.ReactNode;
  theme?: 'default' | 'gradient-preview' | 'gradient-bars';
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer, headerActions, showClose = true, icon, theme = 'default' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isGradientPreview = theme === 'gradient-preview';
  const isGradientBars = theme === 'gradient-bars';
  const frameClass = isGradientPreview
    ? 'bg-gradient-to-br from-[#55506e] via-[#66c1e8] to-[#003785] border border-white/30'
    : 'bg-white';
  const headerClass = 'border-b border-gray-100 bg-gray-100';
  const footerClass = isGradientPreview
    ? 'border-t border-white/25 bg-white/12 backdrop-blur-sm'
    : isGradientBars
      ? 'border-t border-[#28406a] bg-gradient-to-r from-[#55506e] via-[#66c1e8] to-[#003785]'
      : 'border-t border-gray-100 bg-white';
  const titleClass = (isGradientPreview || isGradientBars) ? 'text-white' : 'text-neutral-800';
  const closeBtnClass = (isGradientPreview || isGradientBars)
    ? 'p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-xl transition-all duration-200 group'
    : 'p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all duration-200 group';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/10 transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className={`relative w-full ${sizeStyles[size]} ${frameClass} rounded-none transform transition-all animate-scale-in overflow-hidden`}>
          {/* Header */}
          <div className={`relative px-6 py-4 ${headerClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {icon ? (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(isGradientPreview || isGradientBars) ? 'bg-white/20 text-white' : 'bg-gradient-to-br from-primary-500/20 to-primary-500/5 text-primary-600'}`}>
                    {icon}
                  </div>
                ) : (
                  <div className="w-1 h-8 bg-gradient-to-b from-primary-500 to-accent-500 rounded-full"></div>
                )}
                <h3 className={`text-lg font-bold tracking-tight ${titleClass}`}>{title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {headerActions}
                {showClose && (
                  <button
                    onClick={onClose}
                    className={closeBtnClass}
                  >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 bg-white">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className={`px-6 py-4 ${footerClass}`}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Confirmation Modal - Compact & Beautiful
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'success';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
  icon
}: ConfirmModalProps) {
  const buttonStyles = {
    danger: 'bg-gradient-to-r from-danger-500 to-danger-600 hover:from-danger-600 hover:to-danger-700 text-white shadow-lg shadow-danger-500/20',
    warning: 'bg-gradient-to-r from-warning-500 to-warning-600 hover:from-warning-600 hover:to-warning-700 text-white shadow-lg shadow-warning-500/20',
    primary: 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white shadow-lg shadow-sky-500/20',
    success: 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white shadow-lg shadow-sky-500/20',
  };

  const iconStyles = {
    danger: (
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-danger-100 to-danger-50 flex items-center justify-center mx-auto mb-4 shadow-inner">
        <svg className="w-7 h-7 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    ),
    warning: (
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-warning-100 to-warning-50 flex items-center justify-center mx-auto mb-4 shadow-inner">
        <svg className="w-7 h-7 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    primary: (
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 shadow-inner">
        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    success: (
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-success-100 to-success-50 flex items-center justify-center mx-auto mb-4 shadow-inner">
        <svg className="w-7 h-7 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      showClose={false}
      icon={icon}
      footer={
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-cancel px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
            }}
            disabled={loading}
            className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 flex items-center gap-2 ${buttonStyles[variant]}`}
          >
            {loading && <span className="spinner w-4 h-4 border-2"></span>}
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      }
      >
      <div className="text-center py-2 bg-white">
        {iconStyles[variant]}
        <p className="text-neutral-600 text-sm leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}

// Slide Panel Modal - For forms and detailed content
interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: 'right' | 'left';
}

export function SlidePanel({ isOpen, onClose, title, children, side = 'right' }: SlidePanelProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} w-full max-w-xl bg-white shadow-2xl transform transition-transform duration-300 animate-slide-${side === 'right' ? 'left' : 'right'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white">
          <h3 className="text-lg font-bold text-neutral-800 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="h-full overflow-y-auto pb-20 scrollbar-sidebar">
          {children}
        </div>
      </div>
    </div>
  );
}
