import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  user: {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    role: string;
    status?: string;
    avatar?: string;
  } | null;
  onLogout: () => void;
  collapsed?: boolean;
  incidentCount?: number;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  description: string;
  adminOnly?: boolean;
  managerOnly?: boolean;
  badge?: number;
}

const adminNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    description: 'Overview & Analytics',
  },
  {
    name: 'Incidents',
    path: '/incidents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    description: 'Manage Incidents',
  },
  {
    name: 'Reports',
    path: '/reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l3-3 3 2 4-5" />
      </svg>
    ),
    description: 'Team performance reports',
    managerOnly: true,
  },
  {
    name: 'Users',
    path: '/users',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
    description: 'User Management',
    adminOnly: true,
  },
];

const adminConfigItems: NavItem[] = [
  {
    name: 'SLA Configuration',
    path: '/admin/sla',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    description: 'SLA policies & hours',
    adminOnly: true,
  },
  {
    name: 'Categories',
    path: '/admin/categories',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    description: 'Incident categories',
    adminOnly: true,
  },
  {
    name: 'System Settings',
    path: '/admin/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: 'System parameters',
    adminOnly: true,
  },
];

const engineerNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    description: 'Overview and quick actions',
  },
  {
    name: 'My Tasks',
    path: '/tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    description: 'Your assigned tasks',
  },
  {
    name: 'All Incidents',
    path: '/incidents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    description: 'View all incidents',
  },
];

const userNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    description: 'Your overview',
  },
  {
    name: 'My Incidents',
    path: '/incidents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    description: 'Your incident history',
  },
];

export default function Sidebar({ user, onLogout, collapsed = false, incidentCount = 0 }: SidebarProps) {
  const location = useLocation();

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  const isEngineer = user?.role === 'ENGINEER';
  const isUser = user && !isAdmin && !isManager && !isEngineer;

  let navItems: NavItem[] = [];
  if (isAdmin || isManager) {
    navItems = adminNavItems;
  } else if (isEngineer) {
    navItems = engineerNavItems;
  } else {
    navItems = userNavItems;
  }

  const filteredNavItems = navItems.filter((item: NavItem) => {
    if (item.adminOnly && user?.role !== 'ADMIN') return false;
    if (item.managerOnly && user?.role !== 'MANAGER') return false;
    return true;
  });

  // Get user display name - only full_name, no role
  const userDisplayName = user?.full_name || user?.username || 'User';
  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-[#131d30] backdrop-blur-xl ${collapsed ? 'w-20' : 'w-72'} flex flex-col transition-all duration-300 z-40 border-r border-white/20`}
      style={{ background: 'radial-gradient(circle, rgba(19, 29, 48, 0.91) 0%, rgba(41, 46, 59, 0.95) 51%)' }}
    >
      {/* Logo */}
      <div className="h-20 flex items-center px-6 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-sky-500 via-sky-600 to-sky-700 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-xl font-bold text-white tracking-tight">NexumDesk</span>
              <span className="text-xs text-white/70 mt-0.5">Incident Management</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto scrollbar-sidebar">
        <div className="px-3 mb-4">
          {!collapsed && (
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Menu</span>
          )}
        </div>
        
        {filteredNavItems.map((item, index) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          const isBadgeTarget =
            (isEngineer && item.path === '/tasks') ||
            ((isAdmin || isManager) && item.path === '/incidents');
          const showIncidentBadge = isBadgeTarget && incidentCount > 0;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-[4px] transition-all duration-200 group relative ${
                isActive
                  ? 'bg-gradient-to-r from-white/20 to-white/5 text-white border border-white/30'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-sky-500 to-sky-700 rounded-r-full"></div>
              )}
              
              <span className={`flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-sky-200' : 'text-white/70 group-hover:text-white group-hover:scale-110'}`}>
                {item.icon}
              </span>
              
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm block">{item.name}</span>
                  <span className="text-xs text-white/60 block truncate">{item.description}</span>
                </div>
              )}

              {showIncidentBadge && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-bold text-white bg-gradient-to-r from-danger-500 to-danger-600 rounded-full shadow-lg shadow-danger-500/30">
                  {incidentCount > 99 ? '99+' : incidentCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Admin Configuration Section */}
        {isAdmin && (
          <>
            <div className="px-3 mt-6 mb-4">
              {!collapsed && (
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Administration</span>
              )}
            </div>
            
            {adminConfigItems.map((item, index) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[4px] transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-gradient-to-r from-white/20 to-white/5 text-white border border-white/30'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`}
                  style={{ animationDelay: `${(filteredNavItems.length + index) * 50}ms` }}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-amber-500 to-amber-700 rounded-r-full"></div>
                  )}
                  
                  <span className={`flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-amber-200' : 'text-white/70 group-hover:text-white group-hover:scale-110'}`}>
                    {item.icon}
                  </span>
                  
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm block">{item.name}</span>
                      <span className="text-xs text-white/60 block truncate">{item.description}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User section - name and role only */}
      {user && (
        <div className="p-4 border-t border-white/10">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between gap-3'} p-2`}>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{userDisplayName}</p>
                <p className="text-xs text-white/70 font-medium">{user.role}</p>
              </div>
            )}
            <button
              onClick={onLogout}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 rounded-lg"
              title="Logout"
              aria-label="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
