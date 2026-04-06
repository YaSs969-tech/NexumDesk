import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import { adminApi } from '../services/api';

interface Category {
  id: string;
  name: string;
  description: string;
  risk_weight: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CategoryFormState {
  id: string;
  name: string;
  description: string;
  risk_weight: number;
  is_active: number;
  sort_order: number;
}

interface Subcategory {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  risk: number;
  impact_affects: number;
  status: 'ACTIVE' | 'INACTIVE';
  sort_order: number;
}

interface SubcategoryFormState {
  id: string;
  category_id: string;
  name: string;
  risk: number;
  impact_affects: number;
  status: 'ACTIVE' | 'INACTIVE';
  sort_order: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryFormState | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<SubcategoryFormState | null>(null);
  const [showDeleteSubcategoryModal, setShowDeleteSubcategoryModal] = useState(false);
  const [deletingSubcategoryId, setDeletingSubcategoryId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'subcategories'>('categories');
  const [subcategoryCategoryFilter, setSubcategoryCategoryFilter] = useState('ALL');
  const [subcategoryImpactFilter, setSubcategoryImpactFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [subcategoryStatusFilter, setSubcategoryStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  useEffect(() => {
    loadCategories();
    loadSubcategories();
  }, []);

  const formatCategoryName = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  };

  const loadCategories = async () => {
    try {
      const res = await adminApi.getCategories();
      setCategories(res.data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const loadSubcategories = async () => {
    try {
      const res = await adminApi.getSubcategories();
      setSubcategories(res.data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load subcategories');
    }
  };

  const openNew = () => {
    setEditingCategory({
      id: 'new-' + Date.now(),
      name: '',
      description: '',
      risk_weight: 2,
      is_active: 1,
      sort_order: categories.length + 1,
    });
    setShowModal(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory({
      id: category.id,
      name: category.name,
      description: category.description || '',
      risk_weight: category.risk_weight,
      is_active: category.is_active,
      sort_order: category.sort_order,
    });
    setShowModal(true);
  };

  const closeFormModal = () => {
    setShowModal(false);
    setEditingCategory(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    setSaving(true);
    setError('');

    try {
      const payload = {
        name: formatCategoryName(editingCategory.name),
        description: editingCategory.description?.trim() || null,
        risk_weight: Number(editingCategory.risk_weight),
        is_active: editingCategory.is_active ? 1 : 0,
        sort_order: editingCategory.sort_order,
      };

      if (editingCategory.id.startsWith('new-')) {
        await adminApi.createCategory(payload);
      } else {
        await adminApi.updateCategory(editingCategory.id, payload);
      }

      await loadCategories();
      closeFormModal();
      setSuccess('Category saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategoryId) return;

    try {
      await adminApi.deleteCategory(deletingCategoryId);
      await loadCategories();
      setSuccess('Category deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    } finally {
      setShowDeleteModal(false);
      setDeletingCategoryId(null);
    }
  };

  const openNewSubcategory = () => {
    setEditingSubcategory({
      id: `new-${Date.now()}`,
      category_id: categories[0]?.id || '',
      name: '',
      risk: 2,
      impact_affects: 1,
      status: 'ACTIVE',
      sort_order: subcategories.length + 1,
    });
    setShowSubcategoryModal(true);
  };

  const openEditSubcategory = (subcategory: Subcategory) => {
    setEditingSubcategory({
      id: subcategory.id,
      category_id: subcategory.category_id,
      name: subcategory.name,
      risk: subcategory.risk,
      impact_affects: subcategory.impact_affects,
      status: subcategory.status,
      sort_order: subcategory.sort_order,
    });
    setShowSubcategoryModal(true);
  };

  const handleSaveSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubcategory) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        category_id: editingSubcategory.category_id,
        name: editingSubcategory.name.trim(),
        risk: Number(editingSubcategory.risk),
        impact_affects: !!editingSubcategory.impact_affects,
        status: editingSubcategory.status,
        sort_order: Number(editingSubcategory.sort_order),
      };

      if (editingSubcategory.id.startsWith('new-')) {
        await adminApi.createSubcategory(payload);
      } else {
        await adminApi.updateSubcategory(editingSubcategory.id, payload);
      }

      await loadSubcategories();
      setShowSubcategoryModal(false);
      setEditingSubcategory(null);
      setSuccess('Subcategory saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save subcategory');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubcategory = async () => {
    if (!deletingSubcategoryId) return;

    try {
      await adminApi.deleteSubcategory(deletingSubcategoryId);
      await loadSubcategories();
      setSuccess('Subcategory deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete subcategory');
    } finally {
      setShowDeleteSubcategoryModal(false);
      setDeletingSubcategoryId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading categories...</div>
      </div>
    );
  }

  const uniqueSubcategoryCategories = Array.from(new Set(
    subcategories
      .map((subcategory) => formatCategoryName(subcategory.category_name || ''))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const filteredSubcategories = subcategories.filter((subcategory) => {
    const categoryName = formatCategoryName(subcategory.category_name || '');
    if (subcategoryCategoryFilter !== 'ALL' && categoryName !== subcategoryCategoryFilter) return false;

    if (subcategoryImpactFilter === 'YES' && !subcategory.impact_affects) return false;
    if (subcategoryImpactFilter === 'NO' && !!subcategory.impact_affects) return false;

    if (subcategoryStatusFilter !== 'ALL' && subcategory.status !== subcategoryStatusFilter) return false;

    return true;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories Management</h1>
        <p className="text-gray-500 text-sm mt-1">Manage incident categories and risk weight values</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="float-right text-red-500 hover:text-red-700">x</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('subcategories')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'subcategories'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Subcategories
        </button>
      </div>

      {activeTab === 'categories' && (
      <div className="bg-white border border-gray-200 rounded-none">
        <div className="p-3 border-b flex justify-between items-center">
          <div>
            <h2 className="font-semibold">Categories</h2>
            <p className="text-gray-500 text-xs mt-0.5">Used in incident classification and ISS calculation</p>
          </div>
          <button onClick={openNew} className="btn-action-reopen flex items-center gap-2 px-3 py-2 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Category
          </button>
        </div>

        <table className="w-full min-w-[820px] border-separate border-spacing-0">
          <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-center">Order</th>
              <th className="px-3 py-2 text-center">Category</th>
              <th className="px-3 py-2 text-center">Risk</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-3 py-2 text-center align-middle font-medium text-sm">{category.sort_order}</td>
                <td className="px-3 py-2 text-center align-middle">
                  <div className="font-medium text-sm leading-tight">{formatCategoryName(category.name)}</div>
                  <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{category.description || '-'}</div>
                </td>
                <td className="px-3 py-2 text-center align-middle font-semibold text-sm">{Number(category.risk_weight).toFixed(1)}</td>
                <td className="px-3 py-2 text-center align-middle">
                  <span className="text-xs font-semibold text-gray-700">{category.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </td>
                <td className="px-3 py-2 text-center align-middle">
                  <div className="flex items-center gap-1.5 justify-center">
                    <button
                      onClick={() => openEdit(category)}
                      className="p-1.5 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        setDeletingCategoryId(category.id);
                        setShowDeleteModal(true);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No categories configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {activeTab === 'subcategories' && (
      <div className="bg-white border border-gray-200 rounded-none">
        <div className="p-3 border-b flex justify-between items-center">
          <div>
            <h2 className="font-semibold">Subcategories</h2>
            <p className="text-gray-500 text-xs mt-0.5">Used for TSS severity calculation</p>
          </div>
          <button onClick={openNewSubcategory} className="btn-action-reopen flex items-center gap-2 px-3 py-2 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Subcategory
          </button>
        </div>

        <div className="p-3 border-b bg-gray-50">
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={subcategoryCategoryFilter}
              onChange={(e) => setSubcategoryCategoryFilter(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="ALL">All Categories</option>
              {uniqueSubcategoryCategories.map((categoryName) => (
                <option key={categoryName} value={categoryName}>{categoryName}</option>
              ))}
            </select>

            <select
              value={subcategoryImpactFilter}
              onChange={(e) => setSubcategoryImpactFilter(e.target.value as 'ALL' | 'YES' | 'NO')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="ALL">All Impact Affects</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>

            <select
              value={subcategoryStatusFilter}
              onChange={(e) => setSubcategoryStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
        </div>

        <table className="w-full min-w-[920px] border-separate border-spacing-0">
          <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-center">Order</th>
              <th className="px-3 py-2 text-center">Category</th>
              <th className="px-3 py-2 text-center">Name</th>
              <th className="px-3 py-2 text-center">Risk</th>
              <th className="px-3 py-2 text-center">Impact Affects</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubcategories.map((subcategory) => (
              <tr key={subcategory.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2 text-center align-middle text-sm font-medium">{subcategory.sort_order}</td>
                <td className="px-3 py-2 text-center align-middle text-sm">{formatCategoryName(subcategory.category_name)}</td>
                <td className="px-3 py-2 text-center align-middle text-sm font-medium">{subcategory.name}</td>
                <td className="px-3 py-2 text-center align-middle text-sm font-semibold">{Number(subcategory.risk).toFixed(1)}</td>
                <td className="px-3 py-2 text-center align-middle text-sm">{subcategory.impact_affects ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2 text-center align-middle">
                  <span className="text-xs font-semibold text-gray-700">{subcategory.status}</span>
                </td>
                <td className="px-3 py-2 text-center align-middle">
                  <div className="flex items-center gap-1.5 justify-center">
                    <button
                      onClick={() => openEditSubcategory(subcategory)}
                      className="p-1.5 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        setDeletingSubcategoryId(subcategory.id);
                        setShowDeleteSubcategoryModal(true);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredSubcategories.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No subcategories configured</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {showDeleteModal && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setDeletingCategoryId(null);
          }}
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
              <p className="text-neutral-600">Are you sure you want to delete this category? This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingCategoryId(null);
                }}
                className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="btn-danger-solid px-6 py-2.5 text-sm font-semibold flex items-center gap-2">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDeleteSubcategoryModal && (
        <Modal
          isOpen={showDeleteSubcategoryModal}
          onClose={() => {
            setShowDeleteSubcategoryModal(false);
            setDeletingSubcategoryId(null);
          }}
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
              <p className="text-neutral-600">Are you sure you want to delete this subcategory? This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteSubcategoryModal(false);
                  setDeletingSubcategoryId(null);
                }}
                className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                Cancel
              </button>
              <button onClick={handleDeleteSubcategory} className="btn-danger-solid px-6 py-2.5 text-sm font-semibold flex items-center gap-2">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showModal && editingCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-none w-full max-w-md mx-4">
            <form onSubmit={handleSave}>
              <div className="p-4 border-b bg-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-none bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-inner">
                    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </span>
                  <h3 className="font-semibold">{editingCategory.id.startsWith('new-') ? 'New Category' : 'Edit Category'}</h3>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    className="w-full border rounded-none px-3 py-2"
                    placeholder="e.g., Database"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editingCategory.description}
                    onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                    className="w-full border rounded-none px-3 py-2"
                    placeholder="Short description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Weight</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={editingCategory.risk_weight}
                    onChange={(e) => setEditingCategory({ ...editingCategory, risk_weight: Number(e.target.value) })}
                    className="w-full border rounded-none px-3 py-2"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">Used in ISS score formula</p>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editingCategory.is_active}
                    onChange={(e) => setEditingCategory({ ...editingCategory, is_active: e.target.checked ? 1 : 0 })}
                    className="rounded-none border-gray-300"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="p-4 border-t bg-white flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeFormModal}
                  className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-action-reopen flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubcategoryModal && editingSubcategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-none w-full max-w-md mx-4">
            <form onSubmit={handleSaveSubcategory}>
              <div className="p-4 border-b bg-gray-100">
                <h3 className="font-semibold">{editingSubcategory.id.startsWith('new-') ? 'New Subcategory' : 'Edit Subcategory'}</h3>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editingSubcategory.category_id}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, category_id: e.target.value })}
                    className="w-full border rounded-none px-3 py-2"
                    required
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{formatCategoryName(category.name)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingSubcategory.name}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, name: e.target.value })}
                    className="w-full border rounded-none px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk (1-5)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="5"
                    value={editingSubcategory.risk}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, risk: Number(e.target.value) })}
                    className="w-full border rounded-none px-3 py-2"
                    required
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editingSubcategory.impact_affects}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, impact_affects: e.target.checked ? 1 : 0 })}
                    className="rounded-none border-gray-300"
                  />
                  <span className="text-sm">Impact affects TSS</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingSubcategory.status === 'ACTIVE'}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })}
                    className="rounded-none border-gray-300"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="p-4 border-t bg-white flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubcategoryModal(false);
                    setEditingSubcategory(null);
                  }}
                  className="btn-cancel px-5 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-action-reopen flex items-center gap-2 px-5 py-2.5 text-sm font-semibold">
                  {saving ? 'Saving...' : 'Save Subcategory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
