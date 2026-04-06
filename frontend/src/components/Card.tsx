import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  gradient?: boolean;
  style?: React.CSSProperties;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Card({ children, className = '', padding = 'md', hover = false, gradient = false, style }: CardProps) {
  return (
    <div className={`
      ${gradient ? 'bg-gradient-to-br from-white to-neutral-50' : 'bg-white'} 
      rounded-[4px] border border-neutral-100 shadow-card 
      ${hover ? 'hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300' : ''} 
      ${paddingStyles[padding]} 
      ${className}
    `} style={style}>
      {children}
    </div>
  );
}

// Stats Card Component - Modern Design
interface StatsCardProps {
  title: string;
  value: number | string;
  change?: {
    value: number;
    trend: 'up' | 'down' | 'neutral';
  };
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange';
  subtitle?: string;
}

const colorStyles = {
  blue: {
    gradient: 'from-blue-600 to-blue-700',
    bg: 'bg-blue-900/90',
    icon: 'bg-blue-700 text-white shadow-lg shadow-blue-700/30',
    text: 'text-blue-300',
    glow: 'shadow-blue-700/10',
  },
  green: {
    gradient: 'from-neutral-600 to-neutral-700',
    bg: 'bg-neutral-900/80',
    icon: 'bg-neutral-700 text-white shadow-lg shadow-neutral-700/30',
    text: 'text-neutral-300',
    glow: 'shadow-neutral-700/10',
  },
  yellow: {
    gradient: 'from-neutral-600 to-neutral-700',
    bg: 'bg-neutral-900/80',
    icon: 'bg-neutral-700 text-white shadow-lg shadow-neutral-700/30',
    text: 'text-neutral-300',
    glow: 'shadow-neutral-700/10',
  },
  red: {
    gradient: 'from-neutral-600 to-neutral-700',
    bg: 'bg-neutral-900/80',
    icon: 'bg-neutral-700 text-white shadow-lg shadow-neutral-700/30',
    text: 'text-neutral-300',
    glow: 'shadow-neutral-700/10',
  },
  purple: {
    gradient: 'from-neutral-600 to-neutral-700',
    bg: 'bg-neutral-900/80',
    icon: 'bg-neutral-700 text-white shadow-lg shadow-neutral-700/30',
    text: 'text-neutral-300',
    glow: 'shadow-neutral-700/10',
  },
  orange: {
    gradient: 'from-neutral-600 to-neutral-700',
    bg: 'bg-neutral-900/80',
    icon: 'bg-neutral-700 text-white shadow-lg shadow-neutral-700/30',
    text: 'text-neutral-300',
    glow: 'shadow-neutral-700/10',
  },
};

export function StatsCard({ title, value, change, icon, color = 'blue', subtitle }: StatsCardProps) {
  const colors = colorStyles[color];

  return (
    <div className={`
      relative overflow-hidden rounded-[4px] border p-6 
      hover:shadow-lg hover:-translate-y-1 transition-all duration-300
      ${color === 'blue' ? 'bg-blue-900/90 border-blue-700/40' : 'bg-neutral-900/80 border-neutral-700/30'}
      ${colors.glow}
    `}>
      {/* Background decoration */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colors.gradient} opacity-10 rounded-full -translate-y-1/2 translate-x-1/2`}></div>
      <div className={`absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-br ${colors.gradient} opacity-10 rounded-full translate-y-1/2 -translate-x-1/2`}></div>
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-400 mb-1">{title}</p>
          <p className="text-4xl font-bold text-white tracking-tight animate-count-up">{value}</p>
          {subtitle && (
            <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>
          )}
          {change && (
            <div className="flex items-center gap-2 mt-3">
              <span className={`
                inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-lg
                ${change.trend === 'up' ? 'bg-success-900/30 text-success-400' : 
                  change.trend === 'down' ? 'bg-danger-900/30 text-danger-400' : 
                  'bg-neutral-800 text-neutral-400'}
              `}>
                {change.trend === 'up' ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                ) : change.trend === 'down' ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                  </svg>
                )}
                {Math.abs(change.value)}%
              </span>
              <span className="text-xs text-neutral-500">vs last week</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={`p-3.5 rounded-[4px] ${colors.icon} transform transition-transform hover:scale-110 hover:rotate-3`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// Metric Card for Dashboard
interface MetricCardProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export function MetricCard({ label, value, icon, trend, trendValue }: MetricCardProps) {
  return (
    <div className="bg-white rounded-[4px] border border-neutral-100 p-4 hover:shadow-card-hover transition-all duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-neutral-800 mt-1">{value}</p>
          {trend && trendValue && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${
              trend === 'up' ? 'text-success-600' : 
              trend === 'down' ? 'text-danger-600' : 
              'text-neutral-500'
            }`}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-neutral-50 rounded-lg text-neutral-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
