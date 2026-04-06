import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from './Modal';

interface IncidentFormProps {
  onClose: (reason?: 'back' | 'cancel') => void;
  onSuccess: () => void;
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    department: string | null;
    job_title: string | null;
  } | null;
  userRole?: string;
  mode?: 'modal' | 'page';
}

interface FormValues {
  title: string;
  description: string;
  category: string;
  subcategory_id: string;
  priority: string; 
  impact: string;
  room: string;
  workstation_id: string;
  severity: string;
  detected_at: string;
  affected_system: string;
}

interface CategoryOption {
  value: string;
  label: string;
}

interface SubcategoryOption {
  id: string;
  name: string;
}

const defaultCategories: CategoryOption[] = [
  { value: 'OTHER', label: 'Other' },
];

const priorities = [
  { value: 'CRITICAL', label: 'Critical', color: 'bg-danger-500' },
  { value: 'HIGH', label: 'High', color: 'bg-warning-500' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-primary-500' },
  { value: 'LOW', label: 'Low', color: 'bg-success-500' },
];

const impacts = [
  { value: 'SINGLE_USER', label: 'Single User' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'ORGANIZATION', label: 'Organization' },
];

const severities = [
  { value: 'SEV-1', label: 'SEV-1 (Critical)' },
  { value: 'SEV-2', label: 'SEV-2 (High)' },
  { value: 'SEV-3', label: 'SEV-3 (Medium)' },
  { value: 'SEV-4', label: 'SEV-4 (Low)' },
];

export default function IncidentForm({ onClose, onSuccess, user, userRole, mode = 'modal' }: IncidentFormProps) {
  const DEFAULT_MAX_UPLOAD_MB = 10;
  const draftStorageKey = `nexum_incident_form_draft_${user?.id || 'anonymous'}`;

  const createInitialFormValues = (): FormValues => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const detectedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return {
      title: '',
      description: '',
      category: 'OTHER',
      subcategory_id: '',
      priority: 'MEDIUM',
      impact: 'SINGLE_USER',
      room: '',
      workstation_id: '',
      severity: '',
      detected_at: detectedAt,
      affected_system: '',
    };
  };
  
  const [formValues, setFormValues] = useState<FormValues>(createInitialFormValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState<number>(DEFAULT_MAX_UPLOAD_MB);
  const [categories, setCategories] = useState<CategoryOption[]>(defaultCategories);
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);

  const canSetSeverity = ['ADMIN', 'MANAGER', 'ENGINEER'].includes(userRole || '');
  const reporterName = user?.full_name?.trim() || 'Reporter';
  const reporterInitials = reporterName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'RP';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const saveDraft = () => {
    // Save draft only after meaningful user input in title/description.
    const hasMeaningfulContent =
      formValues.title.trim().length > 0 || formValues.description.trim().length > 0;
    if (!hasMeaningfulContent) {
      clearDraft();
      return;
    }
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(formValues));
    } catch {}
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(draftStorageKey);
    } catch {
    }
  };

  const handleBack = () => {
    saveDraft();
    onClose('back');
  };

  const handleCancel = () => {
    clearDraft();
    setDraftRestored(false);
    setFormValues(createInitialFormValues());
    setAttachments([]);
    setError(null);
    onClose('cancel');
  };

  useEffect(() => {
    const loadUploadConfig = async () => {
      try {
        const res = await api.get('/incidents/upload-config');
        const raw = Number(res.data?.data?.max_file_size_mb);
        if (Number.isFinite(raw) && raw > 0) {
          setMaxUploadSizeMb(Math.min(10, raw));
        }
      } catch {
        setMaxUploadSizeMb(DEFAULT_MAX_UPLOAD_MB);
      }
    };

    loadUploadConfig();
  }, []);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await api.get('/incidents/categories');
        const items = Array.isArray(res.data?.data) ? res.data.data : [];

        const mapped: CategoryOption[] = items
          .filter((cat: any) => cat?.name)
          .map((cat: any) => ({
            value: String(cat.name).toUpperCase(),
            label: String(cat.name)
              .toLowerCase()
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
          }));

        if (mapped.length > 0) {
          setCategories(mapped);
          setFormValues((prev) => ({
            ...prev,
            category: mapped.some((cat) => cat.value === prev.category) ? prev.category : mapped[0].value,
          }));
          return;
        }

        setCategories(defaultCategories);
      } catch {
        setCategories(defaultCategories);
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    const loadSubcategories = async () => {
      try {
        const res = await api.get('/incidents/subcategories', {
          params: { category: formValues.category },
        });
        const items = Array.isArray(res.data?.data) ? res.data.data : [];
        const mapped: SubcategoryOption[] = items.map((item: any) => ({
          id: String(item.id),
          name: String(item.name),
        }));
        setSubcategories(mapped);
        setFormValues((prev) => ({
          ...prev,
          subcategory_id: mapped.some((item) => item.id === prev.subcategory_id)
            ? prev.subcategory_id
            : (mapped[0]?.id || ''),
        }));
      } catch {
        setSubcategories([]);
        setFormValues((prev) => ({ ...prev, subcategory_id: '' }));
      }
    };

    if (formValues.category) {
      loadSubcategories();
    }
  }, [formValues.category]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FormValues>;
      setFormValues((prev) => ({
        ...prev,
        ...parsed,
      }));
      setDraftRestored(true);
    } catch {
    }
  }, [draftStorageKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(e.target.files || []);
    if (!incomingFiles.length) return;

    const maxBytes = maxUploadSizeMb * 1024 * 1024;
    const validFiles: File[] = [];
    for (const file of incomingFiles) {
      if (file.size > maxBytes) {
        setError(`Each file must be ${maxUploadSizeMb}MB or smaller`);
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      setAttachments((prev) => {
        const merged = [...prev, ...validFiles];
        const deduped = merged.filter((file, index, arr) =>
          arr.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified
          ) === index
        );
        return deduped;
      });
      setError(null);
    }

    // Allow selecting the same file again after removing it.
    e.target.value = '';
  };

  const removeAttachment = (fileToRemove: File) => {
    setAttachments((prev) => prev.filter((file) => file !== fileToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const detectedAtIso = (() => {
        const raw = String(formValues.detected_at || '').trim();
        if (!raw) return new Date().toISOString();
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })();

      if (attachments.length > 0) {
        const uploadData = new FormData();
        uploadData.append('title', formValues.title);
        uploadData.append('description', formValues.description);
        uploadData.append('category', formValues.category);
        uploadData.append('subcategory_id', formValues.subcategory_id || '');
        uploadData.append('urgency', formValues.priority); // Map priority to urgency for backend
        uploadData.append('impact', formValues.impact);
        uploadData.append('room', formValues.room || '');
        uploadData.append('workstation_id', formValues.workstation_id || '');
        uploadData.append('affected_system', formValues.affected_system || '');
        uploadData.append('detected_at', detectedAtIso);
        uploadData.append('department', user?.department || '');
        attachments.forEach((file) => uploadData.append('attachments', file));
        
        if (canSetSeverity && formValues.severity) {
          uploadData.append('severity', formValues.severity);
        }
        
        await api.post('/incidents', uploadData);
      } else {
        const payload: any = {
          title: formValues.title,
          description: formValues.description,
          category: formValues.category,
          subcategory_id: formValues.subcategory_id || null,
          urgency: formValues.priority, // Map priority to urgency for backend
          impact: formValues.impact,
          room: formValues.room || null,
          workstation_id: formValues.workstation_id || null,
          affected_system: formValues.affected_system || null,
          detected_at: detectedAtIso,
          department: user?.department || null,
        };
        
        if (canSetSeverity && formValues.severity) {
          payload.severity = formValues.severity;
        }
        
        await api.post('/incidents', payload);
      }

      clearDraft();
      setDraftRestored(false);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create incident');
    } finally {
      setSubmitting(false);
    }
  };

  const formContent = (
    <form id="incident-form" onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <div className="bg-white rounded-none border border-neutral-200 overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-5 items-stretch">
          <div className="lg:col-span-3 p-4 space-y-5">
            <section className="space-y-3">
              <div>
                <h5 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Title and Description</h5>
                <p className="text-xs text-neutral-500">Describe what happened and what is affected</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                  Title <span className="text-danger-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formValues.title}
                  onChange={handleChange}
                  placeholder="Brief description of the issue"
                  required
                  minLength={5}
                  maxLength={200}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                  Description <span className="text-danger-500">*</span>
                </label>
                <textarea
                  name="description"
                  value={formValues.description}
                  onChange={handleChange}
                  placeholder="Detailed description of the problem..."
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  className="input resize-none"
                />
              </div>
            </section>

            <section className="border-t border-neutral-200 pt-4 space-y-3">
              <div>
                <h5 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Classification</h5>
                <p className="text-xs text-neutral-500">Category, urgency, impact and severity</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                <div className="pl-2.5 py-1.5 border-l-3 border-l-blue-500 bg-blue-50/30 rounded-md">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Category {userRole !== 'USER' && <span className="text-danger-500">*</span>}</p>
                  <select
                    name="category"
                    value={formValues.category}
                    onChange={handleChange}
                    required={userRole !== 'USER'}
                    className="w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-blue-200 rounded px-2 py-1"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="pl-2.5 py-1.5 border-l-3 border-l-indigo-500 bg-indigo-50/30 rounded-md">
                  <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-1">Subcategory <span className="text-danger-500">*</span></p>
                  <select
                    name="subcategory_id"
                    value={formValues.subcategory_id}
                    onChange={handleChange}
                    required={subcategories.length > 0}
                    className="w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-indigo-200 rounded px-2 py-1"
                  >
                    {subcategories.length === 0 && <option value="">No active subcategories</option>}
                    {subcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pl-2.5 py-1.5 border-l-3 border-l-orange-500 bg-orange-50/30 rounded-md">
                  <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">Urgency <span className="text-danger-500">*</span></p>
                  <select name="priority" value={formValues.priority} onChange={handleChange} required className="w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-orange-200 rounded px-2 py-1">
                    {priorities.map(pri => (
                      <option key={pri.value} value={pri.value}>{pri.label}</option>
                    ))}
                  </select>
                </div>

                <div className="pl-2.5 py-1.5 border-l-3 border-l-cyan-500 bg-cyan-50/30 rounded-md">
                  <p className="text-xs text-cyan-600 font-semibold uppercase tracking-wide mb-1">Impact <span className="text-danger-500">*</span></p>
                  <select name="impact" value={formValues.impact} onChange={handleChange} required className="w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-cyan-200 rounded px-2 py-1">
                    {impacts.map(imp => (
                      <option key={imp.value} value={imp.value}>{imp.label}</option>
                    ))}
                  </select>
                </div>

                {canSetSeverity && (
                  <div className="pl-2.5 py-1.5 border-l-3 border-l-purple-500 bg-purple-50/30 rounded-md">
                    <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-1">Severity</p>
                    <select name="severity" value={formValues.severity} onChange={handleChange} className="w-full text-xs font-semibold text-neutral-800 bg-white/70 border border-purple-200 rounded px-2 py-1">
                      <option value="">-- Select Severity --</option>
                      {severities.map(sev => (
                        <option key={sev.value} value={sev.value}>{sev.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Affected System</label>
                  <input
                    type="text"
                    name="affected_system"
                    value={formValues.affected_system}
                    onChange={handleChange}
                    placeholder="e.g., Email, Network, My Workstation"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                    Detected At <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="detected_at"
                    value={formValues.detected_at}
                    onChange={handleChange}
                    required
                    className="input"
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:col-span-2 lg:border-l border-neutral-200 p-4 space-y-4 flex flex-col h-full">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 bg-neutral-50/80">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center">
                {reporterInitials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-800 truncate">{user?.full_name || '-'}</p>
                <p className="text-xs text-neutral-500 truncate">{user?.email || '-'}</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Phone</label>
                <input type="tel" value={user?.phone || '-'} disabled className="input-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Job Title</label>
                <input type="text" value={user?.job_title || '-'} disabled className="input-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Department</label>
                <input type="text" value={user?.department || '-'} disabled className="input-sm bg-white" />
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-4 space-y-3 mt-auto">
              <h5 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Location and Attachments</h5>

              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Room/Desk</label>
                <input
                  type="text"
                  name="room"
                  value={formValues.room}
                  onChange={handleChange}
                  placeholder="e.g., Room 302"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Workstation ID</label>
                <input
                  type="text"
                  name="workstation_id"
                  value={formValues.workstation_id}
                  onChange={handleChange}
                  placeholder="e.g., WS-0032"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Attachments</label>
                <div className="space-y-2">
                  {attachments.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {attachments.map((file, index) => (
                        <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 p-2.5 bg-primary-50/70 border border-primary-200 rounded-lg">
                          <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-700 truncate">{file.name}</p>
                            <p className="text-xs text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(file)}
                            className="p-1.5 text-neutral-400 hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="hidden"
                      id="attachments"
                      multiple
                    />
                    <label
                      htmlFor="attachments"
                      className="flex items-center justify-center gap-2.5 p-3 border-2 border-dashed border-neutral-200 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50/60 transition-all duration-200 group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-neutral-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
                        <svg className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-neutral-600 group-hover:text-primary-600 transition-colors">
                          Upload files
                        </p>
                        <p className="text-xs text-neutral-400">Max {maxUploadSizeMb}MB each (up to 10MB)</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </form>
  );

  if (mode === 'page') {
    return (
      <>
        <header className="-mx-6 -mt-6 mb-4 bg-white/95 backdrop-blur-md border-b border-neutral-200/70 px-8 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handleBack} className="ml-4 px-5 py-2.5 flex items-center gap-2 btn-cancel text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
              <h1 className="text-xl font-semibold text-neutral-700 tracking-tight">Create New Incident</h1>
              {draftRestored && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-semibold border" style={{
                  background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 100%)',
                  color: '#374151',
                  border: '1px solid #cbd5e1',
                  fontWeight: 500
                }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
                  Draft restored
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="btn-cancel px-5 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="incident-form"
                disabled={submitting}
                className="btn-action-reopen px-6 py-2.5 disabled:opacity-50"
              >
                {submitting && <span className="spinner w-4 h-4 border-2"></span>}
                {submitting ? 'Creating...' : 'Submit Incident'}
              </button>
            </div>
          </div>
        </header>

        <div className="p-6">
          <div className="max-w-6xl mr-auto ml-0">
            {formContent}
          </div>
        </div>
      </>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={handleBack}
      title="Create New Incident"
      size="xl"
      showClose={false}
      icon={
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      }
      headerActions={
        <div className="flex gap-3 justify-end">
          {draftRestored && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 self-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              Draft restored
            </span>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="btn-cancel px-5 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="incident-form"
            disabled={submitting}
            className="btn-action-reopen px-6 py-2.5 disabled:opacity-50"
          >
            {submitting && <span className="spinner w-4 h-4 border-2"></span>}
            {submitting ? 'Creating...' : 'Submit Incident'}
          </button>
        </div>
      }
    >
      <div className="max-w-6xl mr-auto ml-0 w-full">
        {formContent}
      </div>
    </Modal>
  );
}
