import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import { adminApi } from '../services/api';
import { PriorityBadge } from '../components/Table';

interface SlaPolicy {
  id: string;
  priority: number;
  name: string;
  response_hours: number;
  resolution_hours: number;
  business_hours_config_id: string | null;
  business_hours_config_name?: string;
  business_hours_only?: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface BusinessHour {
  id: string;
  config_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: number;
}

interface BusinessHoliday {
  id?: string;
  holiday_date: string;
  name: string | null;
}

interface BusinessHourConfig {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  hours: BusinessHour[];
  holidays: BusinessHoliday[];
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SlaConfigurationPage() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [businessConfigs, setBusinessConfigs] = useState<BusinessHourConfig[]>([]);
  const [selectedBusinessConfigId, setSelectedBusinessConfigId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | null>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);
  const [showAddBusinessConfigModal, setShowAddBusinessConfigModal] = useState(false);
  const [showDeleteBusinessConfigModal, setShowDeleteBusinessConfigModal] = useState(false);
  const [newBusinessConfigName, setNewBusinessConfigName] = useState('');
  const [newBusinessConfigDescription, setNewBusinessConfigDescription] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'policies' | 'hours'>('policies');
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState('ALL');
  const [policyStatusFilter, setPolicyStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [policiesRes, hoursRes] = await Promise.all([
        adminApi.getSlaPolicies(),
        adminApi.getBusinessHours()
      ]);
      const loadedPolicies: SlaPolicy[] = policiesRes.data.data || [];
      const loadedConfigs: BusinessHourConfig[] = hoursRes.data.data || [];
      const fallbackConfigId = loadedConfigs[0]?.id || null;
      const normalizedPolicies = loadedPolicies.map(policy => ({
        ...policy,
        business_hours_config_id: policy.business_hours_config_id || fallbackConfigId,
      }));

      setPolicies(normalizedPolicies);
      setBusinessConfigs(loadedConfigs);

      if (!selectedBusinessConfigId && loadedConfigs.length > 0) {
        setSelectedBusinessConfigId(loadedConfigs[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load SLA configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;
    
    setSaving(true);
    setError('');
    try {
      if (editingPolicy.id.startsWith('new-')) {
        const { id, created_at, updated_at, ...data } = editingPolicy;
        await adminApi.createSlaPolicy({ ...data, is_active: editingPolicy.is_active });
      } else {
        await adminApi.updateSlaPolicy(editingPolicy.id, editingPolicy);
      }
      await loadData();
      setShowPolicyModal(false);
      setEditingPolicy(null);
      setSuccess('SLA policy saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save SLA policy');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBusinessHours = async () => {
    if (!selectedConfig) return;

    setSaving(true);
    setError('');
    try {
      await adminApi.updateBusinessHours({
        config_id: selectedConfig.id,
        name: selectedConfig.name,
        description: selectedConfig.description,
        is_active: selectedConfig.is_active,
        hours: selectedConfig.hours,
        holidays: selectedConfig.holidays,
      });
      await loadData();
      setSuccess('Business hours saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save business hours');
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedConfig = (mutator: (cfg: BusinessHourConfig) => BusinessHourConfig) => {
    if (!selectedBusinessConfigId) return;
    setBusinessConfigs(prev => prev.map(cfg => (
      cfg.id === selectedBusinessConfigId ? mutator(cfg) : cfg
    )));
  };

  const updateBusinessHour = (dayOfWeek: number, field: keyof BusinessHour, value: any) => {
    updateSelectedConfig(cfg => ({
      ...cfg,
      hours: cfg.hours.map(h => (
        h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h
      )),
    }));
  };

  const addHoliday = () => {
    updateSelectedConfig(cfg => ({
      ...cfg,
      holidays: [...cfg.holidays, { holiday_date: '', name: '' }],
    }));
  };

  const updateHoliday = (index: number, field: keyof BusinessHoliday, value: string) => {
    updateSelectedConfig(cfg => ({
      ...cfg,
      holidays: cfg.holidays.map((h, i) => i === index ? { ...h, [field]: value } : h),
    }));
  };

  const removeHoliday = (index: number) => {
    updateSelectedConfig(cfg => ({
      ...cfg,
      holidays: cfg.holidays.filter((_, i) => i !== index),
    }));
  };

  const handleCreateBusinessConfig = async () => {
    const trimmedName = newBusinessConfigName.trim();
    if (!trimmedName) {
      setError('Configuration name is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await adminApi.createBusinessHours({
        name: trimmedName,
        description: newBusinessConfigDescription.trim(),
      });
      await loadData();
      setShowAddBusinessConfigModal(false);
      setNewBusinessConfigName('');
      setNewBusinessConfigDescription('');
      setSuccess('Business-hours configuration created');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create business-hours configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBusinessConfig = async () => {
    if (!selectedConfig) return;

    setSaving(true);
    setError('');
    try {
      await adminApi.deleteBusinessHours(selectedConfig.id);
      await loadData();
      setShowDeleteBusinessConfigModal(false);
      setSuccess('Business-hours configuration deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete configuration');
    } finally {
      setSaving(false);
    }
  };

  const openNewPolicy = () => {
    const fallbackConfigId = businessConfigs[0]?.id || null;
    setEditingPolicy({
      id: 'new-' + Date.now(),
      priority: policies.length + 1,
      name: '',
      response_hours: 1,
      resolution_hours: 8,
      business_hours_config_id: fallbackConfigId,
      is_active: 1,
      created_at: '',
      updated_at: ''
    });
    setShowPolicyModal(true);
  };

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours >= 24) return `${hours / 24} days`;
    return `${hours} hr`;
  };

  const selectedConfig = businessConfigs.find(cfg => cfg.id === selectedBusinessConfigId) || null;

  const sortedSelectedHours = selectedConfig
    ? [...selectedConfig.hours].sort((a, b) => a.day_of_week - b.day_of_week)
    : [];

  const uniquePolicyCategories = Array.from(new Set(
    policies.map(policy => policy.name).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const filteredPolicies = policies.filter((policy) => {
    if (policyCategoryFilter !== 'ALL' && policy.name !== policyCategoryFilter) return false;

    const status = policy.is_active ? 'ACTIVE' : 'INACTIVE';
    if (policyStatusFilter !== 'ALL' && status !== policyStatusFilter) return false;

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading SLA configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SLA Configuration</h1>
        <p className="text-gray-500 text-sm mt-1">Manage SLA policies and business hours</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="float-right text-red-500 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'policies'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          SLA Policies
        </button>
        <button
          onClick={() => setActiveTab('hours')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'hours'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Business Hours
        </button>
      </div>

      {/* SLA Policies Tab */}
      {activeTab === 'policies' && (
        <div className="bg-white border border-gray-200 rounded-none">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold">SLA Policies</h2>
              <p className="text-gray-500 text-xs mt-0.5">Define response and resolution times by priority</p>
            </div>
            <button
              onClick={openNewPolicy}
              className="btn-action-reopen flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Policy
            </button>
          </div>

          <div className="p-3 border-b bg-gray-50">
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={policyCategoryFilter}
                onChange={(e) => setPolicyCategoryFilter(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              >
                <option value="ALL">All Categories</option>
                {uniquePolicyCategories.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <select
                value={policyStatusFilter}
                onChange={(e) => setPolicyStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                className="border rounded px-2 py-1.5 text-sm"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>
          
          <table className="w-full min-w-[900px] border-separate border-spacing-0">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Name</th>
                <th className="px-4 py-3 text-center">Response Time</th>
                <th className="px-4 py-3 text-center">Resolution Time</th>
                <th className="px-4 py-3 text-center">Business Hours</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPolicies.map(policy => (
                <tr key={policy.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 text-center align-middle">
                    <PriorityBadge priority={policy.priority?.toString()} format="numbered" size="sm" />
                  </td>
                  <td className="px-4 py-3 text-center font-medium align-middle">{policy.name}</td>
                  <td className="px-4 py-3 text-center align-middle">{formatHours(policy.response_hours)}</td>
                  <td className="px-4 py-3 text-center align-middle">{formatHours(policy.resolution_hours)}</td>
                  <td className="px-4 py-3 text-center align-middle">
                    <span className="text-blue-600 text-sm">{policy.business_hours_config_name || 'Not selected'}</span>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <span className="text-xs font-semibold text-gray-700">{policy.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <div className="flex items-center gap-2 justify-center">
                      <button
                        onClick={() => { setEditingPolicy(policy); setShowPolicyModal(true); }}
                        className="p-2 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setDeletingPolicyId(policy.id); setShowDeleteModal(true); }}
                        className="p-2 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                          {showDeleteModal && (
                            <Modal
                              isOpen={showDeleteModal}
                              onClose={() => { setShowDeleteModal(false); setDeletingPolicyId(null); }}
                              title="Confirm Delete"
                              size="sm"
                              icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              }
                              theme="default"
                            >
                              <div className="bg-white -m-6 p-6">
                                <div className="py-4">
                                  <p className="text-neutral-600">
                                    Are you sure you want to delete this SLA policy? This action cannot be undone.
                                  </p>
                                </div>
                                <div className="flex gap-3 justify-end">
                                  <button
                                    onClick={() => { setShowDeleteModal(false); setDeletingPolicyId(null); }}
                                    className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (deletingPolicyId) {
                                        try {
                                          await adminApi.deleteSlaPolicy(deletingPolicyId);
                                          await loadData();
                                          setSuccess('SLA policy deleted');
                                          setTimeout(() => setSuccess(''), 3000);
                                        } catch (err: any) {
                                          setError(err.message || 'Failed to delete SLA policy');
                                        }
                                      }
                                      setShowDeleteModal(false);
                                      setDeletingPolicyId(null);
                                    }}
                                    className="btn-danger-solid px-6 py-2.5 text-sm font-semibold flex items-center gap-2"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </Modal>
                          )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPolicies.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No SLA policies configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Business Hours Tab */}
      {activeTab === 'hours' && (
        <div className="bg-white border border-gray-200 rounded-none max-w-5xl">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Business Hours</h2>
            <p className="text-gray-500 text-xs mt-0.5">Create multiple calendars (days, hours, holidays) and attach them to SLA policies</p>
          </div>
          
          <div className="p-4">
            <div className="flex flex-col md:flex-row md:items-end gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Configuration</label>
                <select
                  value={selectedBusinessConfigId}
                  onChange={e => setSelectedBusinessConfigId(e.target.value)}
                  className="w-full border rounded-none px-2.5 py-1.5 text-sm"
                >
                  {businessConfigs.map(cfg => (
                    <option key={cfg.id} value={cfg.id}>{cfg.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2 md:pb-0.5">
                <button
                  onClick={() => {
                    setError('');
                    setNewBusinessConfigName('');
                    setNewBusinessConfigDescription('');
                    setShowAddBusinessConfigModal(true);
                  }}
                  disabled={saving}
                  className="p-2 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Add config"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowDeleteBusinessConfigModal(true)}
                  disabled={saving || !selectedConfig}
                  className="p-2 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete config"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {selectedConfig && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedConfig.name}
                    onChange={e => updateSelectedConfig(cfg => ({ ...cfg, name: e.target.value }))}
                    className="w-full border rounded-none px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={selectedConfig.description || ''}
                    onChange={e => updateSelectedConfig(cfg => ({ ...cfg, description: e.target.value }))}
                    className="w-full border rounded-none px-2.5 py-1.5 text-sm"
                    placeholder="Optional notes"
                  />
                </div>
              </div>
            )}

            <div className="rounded-none border border-gray-200 overflow-x-auto max-w-[560px]">
              <div className="min-w-[520px] max-w-[560px]">
              <div className="grid grid-cols-[116px_86px_1fr] bg-gray-50 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <span>Day</span>
                <span>Working</span>
                <span>Schedule</span>
              </div>
              {sortedSelectedHours.map(hour => (
                <div key={hour.id} className="grid grid-cols-[116px_86px_220px] items-center gap-2 px-3 py-2 border-t border-gray-100 text-sm">
                  <div className="font-medium text-gray-800">{dayNames[hour.day_of_week]}</div>

                  <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!hour.is_working_day}
                        onChange={e => updateBusinessHour(hour.day_of_week, 'is_working_day', e.target.checked ? 1 : 0)}
                        className="rounded border-gray-300"
                      />
                      <span className={`${hour.is_working_day ? 'text-gray-700' : 'text-gray-400'}`}>
                        {hour.is_working_day ? 'Yes' : 'No'}
                      </span>
                    </label>
                  
                  {hour.is_working_day ? (
                    <div className="flex items-center gap-1.5 max-w-[220px]">
                      <input
                        type="time"
                        value={hour.start_time}
                        onChange={e => updateBusinessHour(hour.day_of_week, 'start_time', e.target.value)}
                        className="border rounded-none px-2 py-1 text-sm w-[96px]"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="time"
                        value={hour.end_time}
                        onChange={e => updateBusinessHour(hour.day_of_week, 'end_time', e.target.value)}
                        className="border rounded-none px-2 py-1 text-sm w-[96px]"
                      />
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">Non-working day</span>
                  )}
                </div>
              ))}
              </div>
            </div>

            {selectedConfig && (
              <div className="mt-6 border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">Holidays</h3>
                    <p className="text-xs text-gray-500">Excluded dates for this configuration</p>
                  </div>
                  <button onClick={addHoliday} className="btn-manage-ghost px-3 py-2 text-sm">Add Holiday</button>
                </div>

                {selectedConfig.holidays.length === 0 && (
                  <p className="text-sm text-gray-500">No holidays added.</p>
                )}

                <div className="space-y-2">
                  {selectedConfig.holidays.map((holiday, index) => (
                    <div key={`${holiday.id || 'new'}-${index}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                      <input
                        type="date"
                        value={holiday.holiday_date || ''}
                        onChange={e => updateHoliday(index, 'holiday_date', e.target.value)}
                        className="border rounded-none px-2 py-1.5"
                      />
                      <input
                        type="text"
                        value={holiday.name || ''}
                        onChange={e => updateHoliday(index, 'name', e.target.value)}
                        placeholder="Holiday name"
                        className="border rounded-none px-2 py-1.5"
                      />
                      <button
                        onClick={() => removeHoliday(index)}
                        className="p-2 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors justify-self-start"
                        title="Remove holiday"
                        aria-label="Remove holiday"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveBusinessHours}
                disabled={saving || !selectedConfig}
                className="btn-action-reopen flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
              >
                {saving ? 'Saving...' : 'Save Business Hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Policy Edit Modal */}
      {showPolicyModal && editingPolicy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-none w-full max-w-md mx-4">
            <form onSubmit={handleSavePolicy}>
              <div className="p-4 border-b bg-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-none bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-inner">
                    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </span>
                  <h3 className="font-semibold">
                    {editingPolicy.id.startsWith('new-') ? 'New SLA Policy' : 'Edit SLA Policy'}
                  </h3>
                </div>
              </div>
              
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={editingPolicy.priority}
                      onChange={e => setEditingPolicy({ ...editingPolicy, priority: Number(e.target.value) })}
                      className="w-full border rounded-none px-3 py-2"
                    >
                      {[1, 2, 3, 4].map(p => (
                        <option key={p} value={p}>PRY{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={editingPolicy.name}
                      onChange={e => setEditingPolicy({ ...editingPolicy, name: e.target.value })}
                      className="w-full border rounded-none px-3 py-2"
                      placeholder="e.g., Critical"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Response Time (hours)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={editingPolicy.response_hours}
                      onChange={e => setEditingPolicy({ ...editingPolicy, response_hours: Number(e.target.value) })}
                      className="w-full border rounded-none px-3 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Time (hours)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={editingPolicy.resolution_hours}
                      onChange={e => setEditingPolicy({ ...editingPolicy, resolution_hours: Number(e.target.value) })}
                      className="w-full border rounded-none px-3 py-2"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours Configuration</label>
                    <select
                      value={editingPolicy.business_hours_config_id || ''}
                      onChange={e => setEditingPolicy({ ...editingPolicy, business_hours_config_id: e.target.value || null })}
                      className="w-full border rounded-none px-3 py-2"
                      required
                    >
                      <option value="" disabled>Select configuration</option>
                      {businessConfigs.map(cfg => (
                        <option key={cfg.id} value={cfg.id}>{cfg.name}</option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!editingPolicy.is_active}
                      onChange={e => setEditingPolicy({ ...editingPolicy, is_active: e.target.checked ? 1 : 0 })}
                      className="rounded-none border-gray-300"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>
              </div>
              
              <div className="p-4 border-t bg-white flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPolicyModal(false); setEditingPolicy(null); }}
                  className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-action-reopen flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
                >
                  {saving ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBusinessConfigModal && (
        <Modal
          isOpen={showAddBusinessConfigModal}
          onClose={() => {
            setShowAddBusinessConfigModal(false);
            setNewBusinessConfigName('');
            setNewBusinessConfigDescription('');
          }}
          title="Add Business-hours Configuration"
          size="sm"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
          theme="default"
        >
          <div className="bg-white -m-6 p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newBusinessConfigName}
                  onChange={(e) => setNewBusinessConfigName(e.target.value)}
                  placeholder="e.g. Mon-Fri + Holidays"
                  className="w-full border rounded-none px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newBusinessConfigDescription}
                  onChange={(e) => setNewBusinessConfigDescription(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full border rounded-none px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowAddBusinessConfigModal(false);
                  setNewBusinessConfigName('');
                  setNewBusinessConfigDescription('');
                }}
                className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBusinessConfig}
                disabled={saving}
                className="btn-action-reopen px-6 py-2.5 text-sm font-semibold flex items-center gap-2"
              >
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDeleteBusinessConfigModal && selectedConfig && (
        <Modal
          isOpen={showDeleteBusinessConfigModal}
          onClose={() => setShowDeleteBusinessConfigModal(false)}
          title="Confirm Delete"
          size="sm"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          }
          theme="default"
        >
          <div className="bg-white -m-6 p-6">
            <div className="py-4">
              <p className="text-neutral-600">
                Are you sure you want to delete configuration "{selectedConfig.name}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteBusinessConfigModal(false)}
                className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBusinessConfig}
                disabled={saving}
                className="btn-danger-solid px-6 py-2.5 text-sm font-semibold flex items-center gap-2"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
