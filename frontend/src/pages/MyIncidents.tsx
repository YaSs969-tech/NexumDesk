import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Header, Card, StatusBadge, SeverityBadge, PriorityBadge } from '../components';
import { generateNDI } from '../utils/format';

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  priority: string;
  status: string;
  service_id: string;
  service_name?: string;
  created_by: string;
  created_by_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_at: string;
  department?: string;
  urgency?: string;
  attachment_url?: string;
  category?: string;
  impact?: string;
  office_location?: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  full_name?: string;
  phone?: string | null;
  department?: string | null;
  job_title?: string | null;
}

interface FormUser {
  id: string;
  full_name: string;
  email: string;
  department: string;
}

export default function MyIncidents({ user }: { user: UserData | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
    // Auto-apply filter from query param
    useEffect(() => {
      const params = new URLSearchParams(location.search);
      const filter = params.get('filter');
      if (filter && filter.startsWith('status-')) {
        const status = filter.replace('status-', '').toUpperCase();
        const normalizedStatus = status === 'CLOSED' ? 'Canceled' : status;
        if (statusFilter !== normalizedStatus) setStatusFilter(normalizedStatus);
      }
      if (filter === 'all') {
        if (statusFilter !== '') setStatusFilter('');
      }
    }, [location.search]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [datePreset, setDatePreset] = useState<'all' | 'day' | 'month'>('all');
  const [engineers, setEngineers] = useState<Array<{id: string, full_name: string}>>([]);
  type MyIncidentFiltersState = {
    searchFilter: string;
    statusFilter: string;
    priorityFilter: string;
    categoryFilter: string;
    assignedFilter: string;
    datePreset: 'all' | 'day' | 'month';
  };

  const load = async () => {
    try {
      setLoading(true);
      
      // Load incidents
      const incidentsRes = await api.get('/incidents?limit=5000&page=1');
      const allIncidents = Array.isArray(incidentsRes.data) 
        ? incidentsRes.data 
        : (incidentsRes.data.data?.incidents || incidentsRes.data.data || []);
      
      const userIncidents = Array.isArray(allIncidents)
        ? allIncidents
            .filter((i: Incident) => i.created_by === user?.id)
            .sort((a: Incident, b: Incident) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [];
      setIncidents(userIncidents);
      
      // Non-admin roles cannot list all users, so avoid /users and infer engineers from incidents.
      if (user?.role === 'ADMIN') {
        const usersRes = await api.get('/users');
        const allUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.data || []);
        const engineerList = allUsers
          .filter((u: any) => u.role === 'ENGINEER')
          .map((u: any) => ({ id: u.id, full_name: u.full_name || u.username }));
        setEngineers(engineerList);
      } else {
        const uniqueEngineers = new Map<string, {id: string, full_name: string}>();
        userIncidents.forEach((inc: Incident) => {
          if (inc.assigned_to && inc.assigned_to_name) {
            uniqueEngineers.set(inc.assigned_to, {
              id: inc.assigned_to,
              full_name: inc.assigned_to_name
            });
          }
        });
        setEngineers(Array.from(uniqueEngineers.values()));
      }
    } catch (e: any) {
      console.error('Failed to load incidents:', e);
      setIncidents([]);
      setEngineers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;
    const createSuccess = (location.state as { createSuccess?: string } | null)?.createSuccess;
    const restoreFilters = (location.state as { restoreFilters?: MyIncidentFiltersState } | null)?.restoreFilters;

    if (restoreFilters) {
      setSearchFilter(restoreFilters.searchFilter || '');
      setStatusFilter(restoreFilters.statusFilter || '');
      setPriorityFilter(restoreFilters.priorityFilter || '');
      setCategoryFilter(restoreFilters.categoryFilter || '');
      setAssignedFilter(restoreFilters.assignedFilter || '');
      setDatePreset(restoreFilters.datePreset || 'all');
    }

    if (createSuccess) {
      setSuccessMsg(createSuccess);
      setTimeout(() => setSuccessMsg(''), 3000);
      load();
    }

    if (typeof restoreScrollY === 'number') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreScrollY, behavior: 'auto' });
      });
    }

    if (typeof restoreScrollY === 'number' || createSuccess || restoreFilters) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const filteredIncidents = incidents
    .filter((incident) => {
      const prioritySource = incident.urgency || incident.priority;
      const normalizedSearch = searchFilter.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        incident.title.toLowerCase().includes(normalizedSearch) ||
        incident.description?.toLowerCase().includes(normalizedSearch) ||
        incident.id.toLowerCase().includes(normalizedSearch) ||
        generateNDI(incident.id).toLowerCase().includes(normalizedSearch) ||
        `id ${generateNDI(incident.id)}`.toLowerCase().includes(normalizedSearch);
      const matchesStatus = !statusFilter || incident.status === statusFilter;
      const matchesPriority = !priorityFilter || prioritySource === priorityFilter;
      const matchesCategory = !categoryFilter || incident.category === categoryFilter;
      const matchesAssigned = !assignedFilter || 
        (assignedFilter === 'unassigned' ? !incident.assigned_to : incident.assigned_to === assignedFilter);
      const createdAt = new Date(incident.created_at);
      const now = new Date();
      const isToday =
        createdAt.getDate() === now.getDate() &&
        createdAt.getMonth() === now.getMonth() &&
        createdAt.getFullYear() === now.getFullYear();
      const isThisMonth =
        createdAt.getMonth() === now.getMonth() &&
        createdAt.getFullYear() === now.getFullYear();
      const matchesDatePreset =
        datePreset === 'all' ||
        (datePreset === 'day' && isToday) ||
        (datePreset === 'month' && isThisMonth);
      return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssigned && matchesDatePreset;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const stats = {
    total: filteredIncidents.length,
    open: filteredIncidents.filter(i => i.status === 'OPEN').length,
    progress: filteredIncidents.filter(i => i.status === 'IN_PROGRESS').length,
    resolved: filteredIncidents.filter(i => i.status === 'RESOLVED').length,
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-danger-100 text-danger-700';
      case 'HIGH': return 'bg-warning-100 text-warning-700';
      case 'MEDIUM': return 'bg-primary-100 text-primary-700';
      case 'LOW': return 'bg-neutral-100 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="bg-transparent">
      <Header user={user} title="My Incidents" subtitle="Your incident requests" actions={
        <button
          onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
          className="btn-pry1 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Incident
        </button>
      } />
      
      {successMsg && (
        <div className="mx-6 mt-4 px-4 py-3 bg-success-50 border border-success-200 text-success-700 rounded-lg">
          {successMsg}
        </div>
      )}

      <div className="px-6 pt-6 pb-4 flex gap-3 flex-wrap items-center">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search my incidents..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="input pl-10 max-w-xs"
          />
        </div>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="select max-w-[170px]">
          <option value="">All Urgencies</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select max-w-[170px]">
          <option value="">All Categories</option>
          <option value="Hardware">Hardware</option>
          <option value="Software">Software</option>
          <option value="Network">Network</option>
          <option value="Access">Access</option>
          <option value="Other">Other</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select max-w-[170px]">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
          <option value="Canceled">Canceled</option>
          <option value="REOPENED">Reopened</option>
        </select>
        <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="select max-w-[180px]">
          <option value="">All Engineers</option>
          <option value="unassigned">Unassigned</option>
          {engineers.map((eng) => (
            <option key={eng.id} value={eng.id}>{eng.full_name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 px-2 py-1 border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white rounded-none shadow-sm">
          <div className="w-8 h-8 rounded-none bg-primary-50 flex items-center justify-center border border-primary-100">
            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-none">
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('day')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'day' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors whitespace-nowrap ${datePreset === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              This Month
            </button>
          </div>
        </div>
        {(searchFilter || statusFilter || priorityFilter || categoryFilter || assignedFilter || datePreset !== 'all') && (
          <button
            onClick={() => {
              setSearchFilter('');
              setStatusFilter('');
              setPriorityFilter('');
              setCategoryFilter('');
              setAssignedFilter('');
              setDatePreset('all');
            }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reset filters
          </button>
        )}
      </div>
      
      <div className="px-6 pb-6">
        <Card padding="none" className="bg-white border border-gray-200 shadow-sm rounded-none">
          <div className="px-5 py-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Incident History</h3>
              <p className="text-sm text-gray-500 mt-0.5">{filteredIncidents.length} incidents found</p>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-neutral-900 rounded-full animate-spin" />
              <p className="mt-4 text-gray-500">Loading...</p>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No incidents found.</p>
              <button
                onClick={() => navigate('/incidents/new', { state: { from: `${location.pathname}${location.search}`, scrollY: window.scrollY } })}
                className="mt-4 btn-primary"
              >
                Create your first incident
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[520px] scrollbar-sidebar">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Incident</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Urgency</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredIncidents.map((incident) => {
                    const { date, time } = formatDateTime(incident.created_at);
                    return (
                      <tr
                        key={incident.id}
                        className="hover:bg-gray-50 group cursor-pointer"
                        onClick={() => {
                          navigate(`/incidents/${incident.id}`, {
                            state: {
                              from: `${location.pathname}${location.search}`,
                              scrollY: window.scrollY,
                              restoreFilters: {
                                searchFilter,
                                statusFilter,
                                priorityFilter,
                                categoryFilter,
                                assignedFilter,
                                datePreset,
                              },
                            },
                          });
                        }}
                      >
                        <td className="px-2 py-2">
                          <span className="text-sm font-semibold text-neutral-600">ID {generateNDI(incident.id)}</span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-neutral-900 group-hover:text-primary-600 transition-colors flex items-center gap-2 min-w-0">
                            {incident.title}
                          </div>
                          <p className="text-sm text-gray-500 truncate max-w-xs">{incident.description}</p>
                        </td>
                        <td className="px-2 py-2 text-sm text-neutral-900 text-center">
                          {(() => {
                            const categoryText = (incident.category || 'other').replace(/_/g, ' ').toLowerCase();
                            return categoryText.charAt(0).toUpperCase() + categoryText.slice(1);
                          })()}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex justify-center">
                            <PriorityBadge priority={incident.urgency || incident.priority} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex justify-center">
                            <StatusBadge status={incident.status} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-700 text-center">
                          <div>{date}</div>
                          <div className="text-gray-500">{time}</div>
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-700 text-center">
                          {incident.assigned_to_name || <span className="text-gray-400 italic">Unassigned</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      
    </div>
  );
}
