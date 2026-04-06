import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';

interface Setting {
  id: string;
  key: string;
  value: string;
  type: string;
  category: string;
  label: string;
  description: string;
  updated_by: string | null;
  updated_at: string;
}

const categoryLabels: Record<string, { label: string; description: string }> = {
  iss: { label: 'ISS Calculation', description: 'Incident Severity Score calculation parameters' },
  tss: { label: 'TSS Calculation', description: 'Technical Severity Score parameters and severity mapping thresholds' },
  sla: { label: 'SLA Monitoring', description: 'SLA monitoring and alerting settings' },
  auto_assign: { label: 'Auto-Assignment', description: 'Auto-assignment policy, creator trust controls by tier, and capacity controls' },
  upload: { label: 'File Uploads', description: 'File upload restrictions' },
  notifications: { label: 'Notification', description: 'Email and notification settings' },
};

const categoryDisplayOrder = ['iss', 'tss', 'auto_assign', 'sla', 'notifications', 'upload'];

const allowedTssKeys = new Set([
  'tss.boost_single_user',
  'tss.boost_department',
  'tss.boost_organization',
  'tss.threshold_sev1',
  'tss.threshold_sev2',
  'tss.threshold_sev3',
]);

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await adminApi.getSettings();
      const data = res.data.data || [];
      setSettings(data);
      // Initialize edited values
      const initial: Record<string, string> = {};
      data.forEach((s: Setting) => { initial[s.key] = s.value; });
      setEditedValues(initial);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
    // Check if any value differs from original
    const setting = settings.find(s => s.key === key);
    if (setting) {
      const hasAnyChange = settings.some(s => {
        const newVal = key === s.key ? value : editedValues[s.key];
        return newVal !== s.value;
      });
      setHasChanges(hasAnyChange);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // Find changed settings
      const changes: { key: string; value: string }[] = [];
      settings.forEach(s => {
        if (editedValues[s.key] !== s.value) {
          changes.push({ key: s.key, value: editedValues[s.key] });
        }
      });
      
      if (changes.length > 0) {
        await adminApi.bulkUpdateSettings(changes);
        await loadSettings();
        setHasChanges(false);
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initial: Record<string, string> = {};
    settings.forEach((s: Setting) => { initial[s.key] = s.value; });
    setEditedValues(initial);
    setHasChanges(false);
  };

  const renderInput = (setting: Setting) => {
    const value = editedValues[setting.key] ?? setting.value;

    if (setting.key.startsWith('auto_assign.fallback_sev')) {
      const allTiers = ['JUNIOR', 'MID', 'SENIOR'];
      const defaultByKey: Record<string, string> = {
        'auto_assign.fallback_sev1': 'SENIOR',
        'auto_assign.fallback_sev2': 'MID',
        'auto_assign.fallback_sev3': 'JUNIOR',
        'auto_assign.fallback_sev4': 'JUNIOR',
      };
      const selected = String(value || '')
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item, index, arr) => allTiers.includes(item) && arr.indexOf(item) === index);

      const normalizedSelection = selected.length ? selected : [defaultByKey[setting.key] || 'JUNIOR'];

      const toggleTier = (tier: string) => {
        const current = [...normalizedSelection];
        const exists = current.includes(tier);
        let next: string[];

        if (exists) {
          if (current.length === 1) {
            next = current;
          } else {
            next = current.filter((item) => item !== tier);
          }
        } else {
          next = [...current, tier];
        }

        handleValueChange(setting.key, next.join(','));
      };

      return (
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            {allTiers.map((tier) => {
              const isSelected = normalizedSelection.includes(tier);
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                  title={isSelected ? 'Remove tier from fallback chain' : 'Add tier at end of fallback chain'}
                >
                  {tier}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-gray-500">
            Priority order: {normalizedSelection.join(' -> ')}
          </div>
        </div>
      );
    }
    
    if (setting.type === 'boolean') {
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={e => handleValueChange(setting.key, e.target.checked ? 'true' : 'false')}
            className="rounded border-gray-300"
          />
          <span className="text-sm">{value === 'true' ? 'Enabled' : 'Disabled'}</span>
        </label>
      );
    }
    
    if (setting.type === 'number') {
      const isUploadMaxFileSize = setting.key === 'upload.max_file_size_mb';
      const isAutoAssignLimit = setting.key.startsWith('auto_assign.limit_');
      const isTssSeverityThreshold = setting.key.startsWith('tss.threshold_sev');
      return (
        <input
          type="number"
          step={isAutoAssignLimit ? '1' : '0.1'}
          value={value}
          onChange={e => handleValueChange(setting.key, e.target.value)}
          min={isUploadMaxFileSize ? 0.1 : (isAutoAssignLimit ? 1 : (isTssSeverityThreshold ? 1 : undefined))}
          max={isUploadMaxFileSize ? 10 : (isTssSeverityThreshold ? 5 : undefined)}
          className="border rounded px-3 py-1.5 text-sm w-32"
        />
      );
    }
    
    return (
      <input
        type="text"
        value={value}
        onChange={e => handleValueChange(setting.key, e.target.value)}
        className="border rounded px-3 py-1.5 text-sm w-64"
      />
    );
  };

  const responseWarningSetting = settings.find(s => s.key === 'sla.response_warning_threshold');
  const responseRiskToggleSetting = settings.find(s => s.key === 'sla.response_risk_notifications_enabled');

  const highlightedResponseKeys = new Set([
    'sla.response_warning_threshold',
    'sla.response_risk_notifications_enabled',
  ]);

  // Group settings by category, exclude TSS
  const groupedSettings = settings
    .filter((s) => !highlightedResponseKeys.has(s.key))
    .filter((s) => s.category !== 'tss' || allowedTssKeys.has(s.key))
    .reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    }, {} as Record<string, Setting[]>);

  const getSeverityRankFromKey = (key: string): number => {
    if (key.includes('sev1')) return 1;
    if (key.includes('sev2')) return 2;
    if (key.includes('sev3')) return 3;
    if (key.includes('sev4')) return 4;
    return 99;
  };

  const getOrderedSettingsForCategory = (category: string, list: Setting[]): Setting[] => {
    if (category === 'iss') {
      const order = [
        'iss.category_weight',
        'iss.urgency_weight',
        'iss.impact_weight',
        'iss.threshold_p1',
        'iss.threshold_p2',
        'iss.threshold_p3',
      ];
      const indexByKey = new Map(order.map((key, index) => [key, index]));
      return [...list].sort((a, b) => {
        const ai = indexByKey.has(a.key) ? Number(indexByKey.get(a.key)) : 999;
        const bi = indexByKey.has(b.key) ? Number(indexByKey.get(b.key)) : 999;
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
      });
    }

    if (category === 'auto_assign') {
      const rank = (key: string): number => {
        if (key === 'auto_assign.enabled') return 1;
        if (key === 'auto_assign.enable_junior') return 2;
        if (key === 'auto_assign.enable_mid') return 3;
        if (key === 'auto_assign.enable_senior') return 4;
        if (key.startsWith('auto_assign.fallback_sev')) return 100 + getSeverityRankFromKey(key);
        if (key.startsWith('auto_assign.limit_')) {
          if (key.endsWith('junior')) return 200;
          if (key.endsWith('mid')) return 201;
          if (key.endsWith('senior')) return 202;
          return 299;
        }
        if (key.startsWith('auto_assign.severity_points_')) return 300 + getSeverityRankFromKey(key);
        return 900;
      };

      return [...list].sort((a, b) => {
        const ai = rank(a.key);
        const bi = rank(b.key);
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
      });
    }

    if (category === 'tss') {
      const order = [
        'tss.boost_single_user',
        'tss.boost_department',
        'tss.boost_organization',
        'tss.threshold_sev1',
        'tss.threshold_sev2',
        'tss.threshold_sev3',
      ];
      const indexByKey = new Map(order.map((key, index) => [key, index]));
      return [...list].sort((a, b) => {
        const ai = indexByKey.has(a.key) ? Number(indexByKey.get(a.key)) : 999;
        const bi = indexByKey.has(b.key) ? Number(indexByKey.get(b.key)) : 999;
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label);
      });
    }

    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  };

  const orderedCategories = categoryDisplayOrder.filter((category) => (groupedSettings[category] || []).length > 0);

  const responseSettings = [responseRiskToggleSetting, responseWarningSetting].filter(Boolean) as Setting[];

  const renderResponseSettingsCard = () => {
    if (responseSettings.length === 0) return null;

    return (
      <div className="bg-white rounded-none border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Response Time Risk Notifications</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Configure response-time risk monitoring and alert thresholds
          </p>
        </div>
        <div className="divide-y">
          {responseSettings.map((setting) => (
            <div key={setting.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex-1">
                <div className="font-medium text-sm">{setting.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{setting.description}</div>
                <div className="text-xs text-gray-400 mt-1 font-mono">{setting.key}</div>
              </div>
              <div className="ml-4">
                {renderInput(setting)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Configure system-wide parameters</p>
        </div>
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

      {/* Settings Groups */}
      <div className="space-y-6">
        {orderedCategories.map((category) => {
          const categorySettings = getOrderedSettingsForCategory(category, groupedSettings[category] || []);
          const autoAssignGeneral = categorySettings.filter(s =>
            s.key === 'auto_assign.enabled'
            || s.key === 'auto_assign.enable_junior'
            || s.key === 'auto_assign.enable_mid'
            || s.key === 'auto_assign.enable_senior'
          );
          const autoAssignFallback = categorySettings.filter(s => s.key.startsWith('auto_assign.fallback_sev'));
          const autoAssignLimits = categorySettings.filter(s => s.key.startsWith('auto_assign.limit_'));
          const autoAssignPointsCost = categorySettings.filter(s => s.key.startsWith('auto_assign.severity_points_'));
          const autoAssignOther = categorySettings.filter(s =>
            !autoAssignGeneral.some(g => g.key === s.key)
            && !autoAssignFallback.some(f => f.key === s.key)
            && !autoAssignLimits.some(l => l.key === s.key)
            && !autoAssignPointsCost.some(p => p.key === s.key)
          );

          const renderSettingRows = (list: Setting[]) => (
            <div className="divide-y">
              {list.map(setting => (
                <div key={setting.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{setting.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{setting.description}</div>
                    <div className="text-xs text-gray-400 mt-1 font-mono">{setting.key}</div>
                  </div>
                  <div className="ml-4">
                    {renderInput(setting)}
                  </div>
                </div>
              ))}
            </div>
          );

          const renderSubsection = (title: string, description: string, list: Setting[]) => {
            if (list.length === 0) return null;
            return (
              <div className="border-t first:border-t-0">
                <div className="px-4 pt-3 pb-2 bg-gray-50/60">
                  <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                {renderSettingRows(list)}
              </div>
            );
          };

          return (
          <div key={category} className="space-y-6">
            <div className="bg-white rounded-none border">
              <div className="p-4 border-b">
                <h2 className="font-semibold">{categoryLabels[category]?.label || category}</h2>
                <p className="text-gray-500 text-xs mt-0.5">
                  {categoryLabels[category]?.description || `Settings for ${category}`}
                </p>
              </div>

              {category === 'iss' ? (
                <>
                  {renderSubsection(
                    'ISS Core Weights',
                    'Order: Category weight, Urgency weight, Impact weight',
                    categorySettings.filter(s => ['iss.category_weight', 'iss.urgency_weight', 'iss.impact_weight'].includes(s.key))
                  )}
                  {renderSubsection(
                    'Priority Threshold by ISS Score',
                    'Configure score cutoffs used to map ISS into priority (Low, Medium, High, Critical)',
                    categorySettings.filter(s => ['iss.threshold_p1', 'iss.threshold_p2', 'iss.threshold_p3'].includes(s.key))
                  )}
                  {renderSettingRows(categorySettings.filter(s => ![
                    'iss.category_weight',
                    'iss.urgency_weight',
                    'iss.impact_weight',
                    'iss.threshold_p1',
                    'iss.threshold_p2',
                    'iss.threshold_p3',
                  ].includes(s.key)))}
                </>
              ) : category === 'auto_assign' ? (
                <>
                  {renderSubsection('Eligibility', 'Global on/off plus direct auto-assign by creator tier (Junior/Mid/Senior)', autoAssignGeneral)}
                  {renderSubsection('Required Tier', 'Required engineer tier per severity (SEV-1 to SEV-4)', autoAssignFallback)}
                  {renderSubsection('Points per Severity', 'Points cost used by auto-assign capacity balancing per severity', autoAssignPointsCost)}
                  {renderSubsection('Points Limit', 'Tier default capacity limits used when engineer override is 0', autoAssignLimits)}
                  {renderSubsection('Other Settings', 'Additional auto-assignment parameters', autoAssignOther)}
                </>
              ) : category === 'tss' ? (
                <>
                  {renderSubsection(
                    'Impact Boosts',
                    'TSS = subcategory risk + impact boost (based on impact type)',
                    categorySettings.filter(s => ['tss.boost_single_user', 'tss.boost_department', 'tss.boost_organization'].includes(s.key))
                  )}
                  {renderSubsection(
                    'Severity Thresholds by TSS Score',
                    'Configure SEV-1..SEV-3 score cutoffs; SEV-4 is derived automatically below SEV-3',
                    categorySettings.filter(s => ['tss.threshold_sev1', 'tss.threshold_sev2', 'tss.threshold_sev3'].includes(s.key))
                  )}
                  {renderSettingRows(categorySettings.filter(s => ![
                    'tss.boost_single_user',
                    'tss.boost_department',
                    'tss.boost_organization',
                    'tss.threshold_sev1',
                    'tss.threshold_sev2',
                    'tss.threshold_sev3',
                  ].includes(s.key)))}
                </>
              ) : (
                renderSettingRows(categorySettings)
              )}
            </div>

            {category === 'sla' && renderResponseSettingsCard()}
          </div>
          );
        })}
        
        {Object.keys(groupedSettings).length === 0 && (
          <div className="bg-white rounded-none border p-8 text-center text-gray-500">
            No settings configured
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 bg-white rounded-none shadow-lg border p-4 flex items-center gap-4">
          <span className="text-sm text-gray-600">You have unsaved changes</span>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-action-reopen px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
