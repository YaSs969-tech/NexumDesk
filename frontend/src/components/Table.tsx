import React from 'react';
import { formatPriorityLabel, formatSeverityLabel, normalizePriorityLevel, normalizeSeverityLevel } from '../utils/format';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  solid?: boolean;
}

export default function Table<T extends { id?: string }>({ 
  data, 
  columns, 
  onRowClick, 
  loading = false,
  emptyMessage = 'No data available',
  solid = false,
}: TableProps<T>) {
  const containerClass = solid ? 'bg-white rounded-2xl border border-neutral-200 overflow-hidden' : 'card overflow-hidden';
  const loadingClass = solid ? 'bg-white rounded-2xl border border-neutral-200 p-12' : 'card p-12';
  const emptyClass = solid ? 'bg-white rounded-2xl border border-neutral-200 p-12' : 'card p-12';

  if (loading) {
    return (
      <div className={loadingClass}>
        <div className="flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={emptyClass}>
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-neutral-500 font-medium">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="overflow-x-auto scrollbar-sidebar">
        <table className="table-modern">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr 
                key={(item as any).id || index} 
                onClick={() => onRowClick?.(item)}
                className={`${solid ? (index % 2 === 0 ? 'bg-white' : 'bg-neutral-50/80') : (index % 2 === 0 ? 'bg-white/40' : 'bg-neutral-50/40')} ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className={column.className}>
                    {column.render 
                      ? column.render(item) 
                      : (item as any)[column.key as keyof T]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Status Badge Component - Modern minimal design
interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const statusConfig: Record<string, { icon: React.ReactNode }> = {
    OPEN: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    IN_PROGRESS: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    PENDING: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    RESOLVED: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    Canceled: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    REOPENED: {
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
  };

  const statusLabels: Record<string, string> = {
    Canceled: 'CANCELED',
  };
  const config = statusConfig[status] || statusConfig.OPEN;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  return (
    <span
      className={`inline-flex items-center font-bold ${sizeClasses[size]} text-black bg-neutral-100 border border-neutral-200 shadow-md`}
      style={{ borderRadius: 4 }}
    >
      {config.icon}
      {(statusLabels[status] || status).replace(/_/g, ' ')}
    </span>
  );
}

// Severity Badge Component - Modern minimal design
interface SeverityBadgeProps {
  severity: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SeverityBadge({ severity, size = 'md' }: SeverityBadgeProps) {
  // Handle null/empty severity - just show a dash
  if (!severity) {
    return <span className="text-neutral-400">-</span>;
  }

  const severityConfig: Record<number, { bg: string; border: string }> = {
    1: {
      bg: 'from-red-700 to-red-600',
      border: 'border-red-500/60',
    },
    2: {
      bg: 'from-yellow-600 to-amber-500',
      border: 'border-yellow-400/60',
    },
    3: {
      bg: 'from-blue-700 to-blue-600',
      border: 'border-blue-500/60',
    },
    4: {
      bg: 'from-slate-500 to-slate-400',
      border: 'border-slate-300/70',
    },
  };

  const severityLevel = normalizeSeverityLevel(severity);
  const config = severityConfig[severityLevel] || severityConfig[3];
  const displayLabel = `SEV${severityLevel}`;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium border bg-gradient-to-r text-white ${config.bg} ${config.border} ${sizeClasses[size]}`}
      style={{ borderRadius: 4 }}>
      {displayLabel}
    </span>
  );
}

// Priority Badge Component - Modern minimal design
interface PriorityBadgeProps {
  priority: string;
  size?: 'sm' | 'md' | 'lg';
  format?: 'text' | 'numbered';
  customLabel?: string;
}

export function PriorityBadge({ priority, size = 'md', format = 'text', customLabel }: PriorityBadgeProps) {
  const priorityConfig: Record<number, { bg: string; border: string; icon: string }> = {
    1: {
      bg: 'from-red-700 to-red-600',
      border: 'border-red-500/60',
      icon: '⚠',
    },
    2: {
      bg: 'from-yellow-600 to-amber-500',
      border: 'border-yellow-400/60',
      icon: '▲',
    },
    3: {
      bg: 'from-blue-700 to-blue-600',
      border: 'border-blue-500/60',
      icon: '●',
    },
    4: {
      bg: 'from-slate-500 to-slate-400',
      border: 'border-slate-300/70',
      icon: '○',
    },
  };

  const priorityLevel = normalizePriorityLevel(priority);
  const config = priorityConfig[priorityLevel] || priorityConfig[3];
  const displayLabel = customLabel ?? (format === 'numbered' ? `PRY${priorityLevel}` : formatPriorityLabel(priority));
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium border bg-gradient-to-r text-white ${config.bg} ${config.border} ${sizeClasses[size]}`}
      style={{ borderRadius: 4 }}>
      {displayLabel}
    </span>
  );
}

// Category Badge Component
interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
  const categoryConfig: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    HARDWARE: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', icon: '🖥️' },
    SOFTWARE: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: '💻' },
    NETWORK: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: '🌐' },
    SECURITY: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '🔒' },
    OTHER: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: '📋' },
  };

  const config = categoryConfig[category] || categoryConfig.OTHER;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };

  return (
    <span className={`inline-flex items-center font-medium border ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`} style={{ borderRadius: 4 }}>
      <span>{config.icon}</span>
      {category}
    </span>
  );
}

// Generic Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
  const variantClasses: Record<string, string> = {
    default: 'bg-slate-50 text-slate-700 border-slate-200',
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium border ${variantClasses[variant]} ${sizeClasses[size]}`} style={{ borderRadius: 4 }}>
      {children}
    </span>
  );
}

// Role Badge Component
interface RoleBadgeProps {
  role: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const roleConfig: Record<string, { bg: string; text: string; border: string }> = {
    ADMIN: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    MANAGER: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    ENGINEER: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    USER: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    VIEWER: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  };

  const config = roleConfig[role] || roleConfig.USER;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  // Format: only first letter uppercase, rest lowercase
  const formattedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center font-medium bg-transparent text-neutral-800 ${sizeClasses[size]}`}>{formattedRole}</span>
  );
}
