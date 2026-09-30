import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';

import { api, API_BASE_URL } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface Branch {
  id: string;
  name: string;
  city?: string;
  state?: string;
  status?: string;
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: string;
}

interface MenuImage {
  id: string;
  url: string;
  isPrimary: boolean;
  itemId: string;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  discount: number | string;
  ingredients?: string | null;
  preparationTime?: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: string;
  categoryId: string;
  category?: Category;
  images: MenuImage[];
}

type Tab = 'categories' | 'items';

const STAFF_ROLES = ['SUPER_ADMIN', 'MANAGER'];

function getImageUrl(url?: string | null) {
  if (!url) {
    return '';
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${url}`;
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Something went wrong.'
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

function formatPrice(value: number | string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '₹0.00';
  }

  return `₹${numberValue.toFixed(2)}`;
}

export default function Menu() {
  const { employee } = useAuth();

  const [tab, setTab] = useState<Tab>('items');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE'
  >('ALL');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

  const [editingItem, setEditingItem] =
    useState<MenuItem | null>(null);

  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryImage, setCategoryImage] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemIngredients, setItemIngredients] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDiscount, setItemDiscount] = useState('0');
  const [itemPreparationTime, setItemPreparationTime] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  const [selectedItemForImages, setSelectedItemForImages] =
    useState<MenuItem | null>(null);

  const canManage =
    !!employee && STAFF_ROLES.includes(employee.role);

  /*
   * ============================================================
   * BRANCH ACCESS
   * ============================================================
   */

  const visibleBranches = useMemo(() => {
    if (employee?.role === 'SUPER_ADMIN') {
      return branches;
    }

    return branches.filter(
      (branch) => branch.id === employee?.branchId,
    );
  }, [branches, employee]);

  /*
   * ============================================================
   * FILTERED DATA
   * ============================================================
   */

  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return categories.filter((category) => {
      const matchesSearch =
        !normalizedSearch ||
        category.name.toLowerCase().includes(normalizedSearch) ||
        (category.description || '')
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesStatus =
        statusFilter === 'ALL' ||
        category.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, statusFilter]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        (item.description || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        (item.ingredients || '')
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesCategory =
        !categoryFilter ||
        item.categoryId === categoryFilter;

      const matchesStatus =
        statusFilter === 'ALL' ||
        item.status === statusFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus
      );
    });
  }, [
    items,
    search,
    categoryFilter,
    statusFilter,
  ]);

  const activeCategories = categories.filter(
    (category) => category.status === 'ACTIVE',
  );

  const activeItems = items.filter(
    (item) => item.status === 'ACTIVE',
  );

  const inactiveItems = items.filter(
    (item) => item.status === 'INACTIVE',
  );

  /*
   * ============================================================
   * MESSAGES
   * ============================================================
   */

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const showSuccess = (message: string) => {
    setError('');
    setSuccess(message);

    window.setTimeout(() => {
      setSuccess('');
    }, 3500);
  };

  const showError = (message: string) => {
    setSuccess('');
    setError(message);
  };

  /*
   * ============================================================
   * LOAD BRANCHES
   * ============================================================
   */

  const loadBranches = async () => {
    try {
      if (employee?.role === 'SUPER_ADMIN') {
        const response = await api.get('/branches');

        const branchList: Branch[] =
          response.data?.branches || [];

        setBranches(branchList);

        if (!selectedBranchId && branchList.length > 0) {
          setSelectedBranchId(branchList[0].id);
        }

        return;
      }

      if (employee?.branchId) {
        setSelectedBranchId(employee.branchId);

        /*
         * Load the employee's branch as well.
         * This ensures the branch name appears in the selector.
         */
        try {
          const response = await api.get(
            `/branches/${employee.branchId}`,
          );

          const branch =
            response.data?.branch ||
            response.data;

          if (branch?.id) {
            setBranches([branch]);
          }
        } catch {
          /*
           * Branch data is not essential because the ID
           * is already available from the employee session.
           */
        }
      }
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  /*
   * ============================================================
   * LOAD CATEGORIES
   * ============================================================
   */

  const loadCategories = async () => {
    if (!selectedBranchId) {
      setCategories([]);
      return;
    }

    try {
      const response = await api.get('/categories', {
        params: {
          branchId: selectedBranchId,
        },
      });

      const categoryList: Category[] =
        response.data?.categories || [];

      setCategories(categoryList);

      /*
       * Make sure selected category belongs to
       * the currently selected branch.
       */
      if (
        itemCategoryId &&
        !categoryList.some(
          (category) => category.id === itemCategoryId,
        )
      ) {
        setItemCategoryId('');
      }
    } catch (err) {
      showError(getErrorMessage(err));
      setCategories([]);
    }
  };

  /*
   * ============================================================
   * LOAD MENU ITEMS
   * ============================================================
   */

  const loadItems = async () => {
    if (!selectedBranchId) {
      setItems([]);
      return;
    }

    try {
      const response = await api.get('/items', {
        params: {
          branchId: selectedBranchId,
        },
      });

      const itemList: MenuItem[] =
        response.data?.items || [];

      setItems(itemList);
    } catch (err) {
      showError(getErrorMessage(err));
      setItems([]);
    }
  };

  /*
   * ============================================================
   * REFRESH
   * ============================================================
   */

  const refreshMenu = async () => {
    clearMessages();
    setLoading(true);

    try {
      await Promise.all([
        loadCategories(),
        loadItems(),
      ]);

      showSuccess('Menu refreshed successfully.');
    } finally {
      setLoading(false);
    }
  };

  /*
   * ============================================================
   * EFFECTS
   * ============================================================
   */

  useEffect(() => {
    void loadBranches();
  }, [
    employee?.role,
    employee?.branchId,
  ]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    setLoading(true);

    Promise.all([
      loadCategories(),
      loadItems(),
    ])
      .catch((err) => {
        showError(getErrorMessage(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedBranchId]);

  useEffect(() => {
    if (
      activeCategories.length > 0 &&
      !itemCategoryId
    ) {
      setItemCategoryId(activeCategories[0].id);
    }
  }, [categories, itemCategoryId]);

  /*
   * ============================================================
   * CATEGORY
   * ============================================================
   */

  const openAddCategory = () => {
    clearMessages();

    setEditingCategory(null);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryImage('');

    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: Category) => {
    clearMessages();

    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDescription(category.description || '');
    setCategoryImage(category.image || '');

    setCategoryModalOpen(true);
  };

  const saveCategory = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    clearMessages();

    if (!selectedBranchId) {
      showError('Please select a branch.');
      return;
    }

    if (!categoryName.trim()) {
      showError('Category name is required.');
      return;
    }

    setSaving(true);

    try {
      if (editingCategory) {
        await api.put(
          `/categories/${editingCategory.id}`,
          {
            name: categoryName.trim(),
            description:
              categoryDescription.trim() || null,
            image: categoryImage.trim() || null,
          },
        );

        showSuccess(
          'Category updated successfully.',
        );
      } else {
        await api.post('/categories', {
          name: categoryName.trim(),
          description:
            categoryDescription.trim() || null,
          image: categoryImage.trim() || null,
          branchId: selectedBranchId,
        });

        showSuccess(
          'Category created successfully.',
        );
      }

      setCategoryModalOpen(false);

      await loadCategories();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changeCategoryStatus = async (
    category: Category,
    status: 'ACTIVE' | 'INACTIVE',
  ) => {
    clearMessages();

    const action =
      status === 'ACTIVE'
        ? 'activate'
        : 'deactivate';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${category.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(
        `/categories/${category.id}/status`,
        {
          status,
        },
      );

      showSuccess(
        `Category ${
          status === 'ACTIVE'
            ? 'activated'
            : 'deactivated'
        } successfully.`,
      );

      await loadCategories();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  /*
   * ============================================================
   * MENU ITEM
   * ============================================================
   */

  const openAddItem = () => {
    clearMessages();

    if (!selectedBranchId) {
      showError('Please select a branch first.');
      return;
    }

    if (activeCategories.length === 0) {
      showError(
        'Please create an active category before adding a menu item.',
      );
      return;
    }

    setEditingItem(null);

    setItemName('');
    setItemDescription('');
    setItemIngredients('');
    setItemPrice('');
    setItemDiscount('0');
    setItemPreparationTime('');
    setItemCategoryId(
      activeCategories[0]?.id || '',
    );

    setItemModalOpen(true);
  };

  const openEditItem = (item: MenuItem) => {
    clearMessages();

    setEditingItem(item);

    setItemName(item.name);
    setItemDescription(
      item.description || '',
    );
    setItemIngredients(
      item.ingredients || '',
    );
    setItemPrice(String(item.price));
    setItemDiscount(
      String(item.discount ?? 0),
    );

    setItemPreparationTime(
      item.preparationTime != null
        ? String(item.preparationTime)
        : '',
    );

    setItemCategoryId(item.categoryId);

    setItemModalOpen(true);
  };

  /*
   * IMPORTANT:
   * selectedBranchId is sent to the backend when creating
   * a new item.
   */
  const saveItem = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    clearMessages();

    if (!selectedBranchId) {
      showError('Please select a branch.');
      return;
    }

    if (!itemName.trim()) {
      showError('Item name is required.');
      return;
    }

    if (!itemCategoryId) {
      showError('Please select a category.');
      return;
    }

    /*
     * Verify category belongs to selected branch.
     */
    const selectedCategory =
      categories.find(
        (category) =>
          category.id === itemCategoryId,
      );

    if (!selectedCategory) {
      showError(
        'Selected category does not belong to the selected branch.',
      );
      return;
    }

    if (
      selectedCategory.branchId !==
      selectedBranchId
    ) {
      showError(
        'Invalid category for the selected branch.',
      );
      return;
    }

    if (selectedCategory.status !== 'ACTIVE') {
      showError(
        'Please select an active category.',
      );
      return;
    }

    const price = Number(itemPrice);
    const discount = Number(
      itemDiscount || 0,
    );

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      showError(
        'Enter a valid price greater than zero.',
      );
      return;
    }

    if (
      !Number.isFinite(discount) ||
      discount < 0
    ) {
      showError('Enter a valid discount.');
      return;
    }

    if (discount > price) {
      showError(
        'Discount cannot be greater than the item price.',
      );
      return;
    }

    const preparationTime =
      itemPreparationTime
        ? Number(itemPreparationTime)
        : null;

    if (
      preparationTime !== null &&
      (!Number.isInteger(
        preparationTime,
      ) ||
        preparationTime <= 0)
    ) {
      showError(
        'Preparation time must be a positive whole number.',
      );
      return;
    }

    setSaving(true);

    try {
      if (editingItem) {
        /*
         * Do NOT send branchId while editing.
         * The backend keeps the item's original branch.
         */
        await api.put(
          `/items/${editingItem.id}`,
          {
            name: itemName.trim(),
            description:
              itemDescription.trim() ||
              null,
            ingredients:
              itemIngredients.trim() ||
              null,
            price,
            discount,
            preparationTime,
            categoryId: itemCategoryId,
          },
        );

        showSuccess(
          'Menu item updated successfully.',
        );
      } else {
        /*
         * CREATE ITEM
         *
         * The selected branch ID is explicitly sent.
         */
        await api.post('/items', {
          name: itemName.trim(),
          description:
            itemDescription.trim() ||
            null,
          ingredients:
            itemIngredients.trim() ||
            null,
          price,
          discount,
          preparationTime,
          categoryId: itemCategoryId,
          branchId: selectedBranchId,
        });

        showSuccess(
          'Menu item created successfully.',
        );
      }

      setItemModalOpen(false);

      /*
       * Reload only the selected branch's items.
       */
      await loadItems();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changeItemStatus = async (
    item: MenuItem,
    status: 'ACTIVE' | 'INACTIVE',
  ) => {
    clearMessages();

    const action =
      status === 'ACTIVE'
        ? 'activate'
        : 'deactivate';

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${item.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.patch(
        `/items/${item.id}/status`,
        {
          status,
        },
      );

      showSuccess(
        `Menu item ${
          status === 'ACTIVE'
            ? 'activated'
            : 'deactivated'
        } successfully.`,
      );

      await loadItems();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  /*
   * ============================================================
   * IMAGE MANAGEMENT
   * ============================================================
   */

  const openImages = (item: MenuItem) => {
    clearMessages();

    setSelectedItemForImages(item);
    setImageFiles([]);
    setImagePreviewUrls([]);

    setImageModalOpen(true);
  };

  const handleImageSelection = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    clearMessages();

    const files = Array.from(
      event.target.files || [],
    );

    if (files.length === 0) {
      return;
    }

    const validFiles: File[] = [];

    for (const file of files) {
      if (
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
        ].includes(file.type)
      ) {
        showError(
          `${file.name}: only JPG, PNG and WEBP images are allowed.`,
        );

        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        showError(
          `${file.name}: image must be 5 MB or smaller.`,
        );

        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    const currentImageCount =
      selectedItemForImages?.images?.length ||
      0;

    if (
      currentImageCount +
        validFiles.length >
      10
    ) {
      showError(
        'Maximum 10 images are allowed for one menu item.',
      );

      return;
    }

    /*
     * Clean old preview URLs.
     */
    imagePreviewUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    setImageFiles(validFiles);

    const previewUrls =
      validFiles.map((file) =>
        URL.createObjectURL(file),
      );

    setImagePreviewUrls(previewUrls);

    /*
     * Allow selecting the same file again later.
     */
    event.target.value = '';
  };

  const uploadImages = async () => {
    if (!selectedItemForImages) {
      return;
    }

    if (imageFiles.length === 0) {
      showError(
        'Please select at least one image.',
      );

      return;
    }

    setUploading(true);
    clearMessages();

    try {
      const formData = new FormData();

      imageFiles.forEach((file) => {
        formData.append(
          'images',
          file,
        );
      });

      const response = await api.post(
        `/items/${selectedItemForImages.id}/images/upload`,
        formData,
        {
          headers: {
            'Content-Type':
              'multipart/form-data',
          },
        },
      );

      showSuccess(
        response.data?.message ||
          'Images uploaded successfully.',
      );

      setImageFiles([]);

      imagePreviewUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      setImagePreviewUrls([]);

      const refreshed =
        await api.get(
          `/items/${selectedItemForImages.id}`,
        );

      const refreshedItem: MenuItem =
        refreshed.data?.item ||
        refreshed.data;

      setSelectedItemForImages(
        refreshedItem,
      );

      await loadItems();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const setPrimaryImage = async (
    image: MenuImage,
  ) => {
    if (!selectedItemForImages) {
      return;
    }

    try {
      await api.patch(
        `/items/images/${image.id}/primary`,
      );

      showSuccess(
        'Primary image updated.',
      );

      const refreshed =
        await api.get(
          `/items/${selectedItemForImages.id}`,
        );

      const refreshedItem: MenuItem =
        refreshed.data?.item ||
        refreshed.data;

      setSelectedItemForImages(
        refreshedItem,
      );

      await loadItems();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const deleteImage = async (
    image: MenuImage,
  ) => {
    const confirmed = window.confirm(
      'Delete this menu image?',
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(
        `/items/images/${image.id}`,
      );

      showSuccess('Image deleted.');

      if (selectedItemForImages) {
        const refreshed =
          await api.get(
            `/items/${selectedItemForImages.id}`,
          );

        const refreshedItem: MenuItem =
          refreshed.data?.item ||
          refreshed.data;

        setSelectedItemForImages(
          refreshedItem,
        );
      }

      await loadItems();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  /*
   * ============================================================
   * PERMISSION CHECK
   * ============================================================
   */

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        You do not have permission to manage the
        menu.
      </div>
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* HEADER */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-coffee-dark">
            Menu Management
          </h1>

          <p className="mt-1 text-sm text-coffee/60">
            Manage categories, menu items,
            prices, availability and images.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshMenu}
            disabled={loading}
            className="rounded-xl border border-coffee/10 bg-white px-4 py-2 text-sm font-semibold text-coffee-dark shadow-sm hover:bg-cream disabled:opacity-50"
          >
            {loading
              ? 'Refreshing...'
              : '↻ Refresh'}
          </button>

          {tab === 'categories' ? (
            <button
  type="button"
  onClick={() => {
    if (activeCategories.length === 0) {
      clearMessages();
      setTab('categories');
      setCategoryModalOpen(true);
      setEditingCategory(null);
      setCategoryName('');
      setCategoryDescription('');
      setCategoryImage('');
      return;
    }

    openAddItem();
  }}
  className="rounded-xl bg-turmeric px-4 py-2 text-sm font-bold text-coffee-dark shadow-sm hover:bg-turmeric-deep"
>
  + Add Menu Item
</button>
          ) : (
            <button
              type="button"
              onClick={openAddItem}
              disabled={
                !selectedBranchId ||
                activeCategories.length === 0
              }
              className="rounded-xl bg-turmeric px-4 py-2 text-sm font-bold text-coffee-dark shadow-sm hover:bg-turmeric-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add Menu Item
            </button>
          )}
        </div>
      </div>

      {/* BRANCH SELECTOR */}

      <div className="rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-coffee/50">
              Branch
            </div>

            <div className="mt-1 text-sm text-coffee-dark">
              Select the branch whose menu you
              want to manage.
            </div>
          </div>

          {employee?.role === 'SUPER_ADMIN' ? (
            <select
              value={selectedBranchId}
              onChange={(event) => {
                const branchId =
                  event.target.value;

                setSelectedBranchId(
                  branchId,
                );

                /*
                 * Reset branch-dependent state.
                 */
                setCategories([]);
                setItems([]);
                setCategoryFilter('');
                setItemCategoryId('');
              }}
              className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none md:w-80"
            >
              <option value="">
                Select branch
              </option>

              {visibleBranches.map(
                (branch) => (
                  <option
                    key={branch.id}
                    value={branch.id}
                  >
                    {branch.name}
                    {branch.city
                      ? ` — ${branch.city}`
                      : ''}
                  </option>
                ),
              )}
            </select>
          ) : (
            <div className="rounded-xl bg-cream px-4 py-3 text-sm font-semibold text-coffee-dark">
              {branches.find(
                (branch) =>
                  branch.id ===
                  selectedBranchId,
              )?.name ||
                'Assigned branch'}
            </div>
          )}
        </div>
      </div>

      {/* MESSAGES */}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* STATS */}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-coffee/50">
            Categories
          </div>

          <div className="mt-2 text-2xl font-bold text-coffee-dark">
            {categories.length}
          </div>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-coffee/50">
            Active Items
          </div>

          <div className="mt-2 text-2xl font-bold text-green-700">
            {activeItems.length}
          </div>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-coffee/50">
            Inactive Items
          </div>

          <div className="mt-2 text-2xl font-bold text-coffee/60">
            {inactiveItems.length}
          </div>
        </div>

        <div className="rounded-2xl border border-coffee/10 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-coffee/50">
            Branch
          </div>

          <div className="mt-2 truncate text-sm font-bold text-coffee-dark">
            {branches.find(
              (branch) =>
                branch.id ===
                selectedBranchId,
            )?.name ||
              'Not selected'}
          </div>
        </div>
      </div>

      {/* TABS */}

      <div className="rounded-2xl border border-coffee/10 bg-white shadow-sm">
        <div className="flex border-b border-coffee/10">
          <button
            type="button"
            onClick={() => {
              setTab('items');
              setSearch('');
              setStatusFilter('ALL');
            }}
            className={`flex-1 px-5 py-4 text-sm font-bold ${
              tab === 'items'
                ? 'border-b-2 border-turmeric text-coffee-dark'
                : 'text-coffee/50'
            }`}
          >
            🍔 Menu Items
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('categories');
              setSearch('');
              setStatusFilter('ALL');
            }}
            className={`flex-1 px-5 py-4 text-sm font-bold ${
              tab === 'categories'
                ? 'border-b-2 border-turmeric text-coffee-dark'
                : 'text-coffee/50'
            }`}
          >
            📂 Categories
          </button>
        </div>

        {/* FILTERS */}

        <div className="grid gap-3 border-b border-coffee/10 p-4 md:grid-cols-3">
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder={
              tab === 'items'
                ? 'Search menu items...'
                : 'Search categories...'
            }
            className="rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none"
          />

          {tab === 'items' ? (
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value,
                )
              }
              className="rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none"
            >
              <option value="">
                All categories
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                ),
              )}
            </select>
          ) : (
            <div />
          )}

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | 'ALL'
                  | 'ACTIVE'
                  | 'INACTIVE',
              )
            }
            className="rounded-xl border border-coffee/10 bg-cream px-4 py-3 text-sm outline-none"
          >
            <option value="ALL">
              All statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>
          </select>
        </div>

        {/* CATEGORY TABLE */}

        {tab === 'categories' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead>
                <tr className="border-b border-coffee/10 text-left text-xs uppercase tracking-wider text-coffee/50">
                  <th className="px-5 py-4">
                    Category
                  </th>

                  <th className="px-5 py-4">
                    Description
                  </th>

                  <th className="px-5 py-4">
                    Status
                  </th>

                  <th className="px-5 py-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredCategories.map(
                  (category) => (
                    <tr
                      key={category.id}
                      className="border-b border-coffee/5"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {category.image ? (
                            <img
                              src={getImageUrl(
                                category.image,
                              )}
                              alt={
                                category.name
                              }
                              className="h-12 w-12 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cream text-xl">
                              📂
                            </div>
                          )}

                          <div>
                            <div className="font-bold text-coffee-dark">
                              {category.name}
                            </div>

                            <div className="text-xs text-coffee/50">
                              Category
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-coffee/70">
                        {category.description ||
                          '—'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            category.status ===
                            'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {category.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditCategory(
                                category,
                              )
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-bold"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              changeCategoryStatus(
                                category,
                                category.status ===
                                  'ACTIVE'
                                  ? 'INACTIVE'
                                  : 'ACTIVE',
                              )
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-bold"
                          >
                            {category.status ===
                            'ACTIVE'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}

                {filteredCategories.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-12 text-center text-sm text-coffee/50"
                    >
                      No categories found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ITEM TABLE */}

        {tab === 'items' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-coffee/10 text-left text-xs uppercase tracking-wider text-coffee/50">
                  <th className="px-5 py-4">
                    Item
                  </th>

                  <th className="px-5 py-4">
                    Category
                  </th>

                  <th className="px-5 py-4">
                    Price
                  </th>

                  <th className="px-5 py-4">
                    Discount
                  </th>

                  <th className="px-5 py-4">
                    Prep Time
                  </th>

                  <th className="px-5 py-4">
                    Status
                  </th>

                  <th className="px-5 py-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  const primaryImage =
                    item.images?.find(
                      (image) =>
                        image.isPrimary,
                    ) ||
                    item.images?.[0];

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-coffee/5"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {primaryImage ? (
                            <img
                              src={getImageUrl(
                                primaryImage.url,
                              )}
                              alt={item.name}
                              className="h-14 w-14 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-cream text-xl">
                              🍔
                            </div>
                          )}

                          <div>
                            <div className="font-bold text-coffee-dark">
                              {item.name}
                            </div>

                            <div className="max-w-xs truncate text-xs text-coffee/50">
                              {item.description ||
                                item.ingredients ||
                                'No description'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-coffee-dark">
                        {item.category?.name ||
                          categories.find(
                            (category) =>
                              category.id ===
                              item.categoryId,
                          )?.name ||
                          '—'}
                      </td>

                      <td className="px-5 py-4 text-sm font-bold text-coffee-dark">
                        {formatPrice(
                          item.price,
                        )}
                      </td>

                      <td className="px-5 py-4 text-sm text-coffee/70">
                        {formatPrice(
                          item.discount,
                        )}
                      </td>

                      <td className="px-5 py-4 text-sm text-coffee/70">
                        {item.preparationTime
                          ? `${item.preparationTime} min`
                          : '—'}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            item.status ===
                            'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditItem(
                                item,
                              )
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-bold"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openImages(item)
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-bold"
                          >
                            Images
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              changeItemStatus(
                                item,
                                item.status ===
                                  'ACTIVE'
                                  ? 'INACTIVE'
                                  : 'ACTIVE',
                              )
                            }
                            className="rounded-lg border border-coffee/10 px-3 py-2 text-xs font-bold"
                          >
                            {item.status ===
                            'ACTIVE'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-coffee/50"
                    >
                      {selectedBranchId
                        ? 'No menu items found.'
                        : 'Select a branch first.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================
          CATEGORY MODAL
      ====================================================== */}

      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveCategory}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  {editingCategory
                    ? 'Edit Category'
                    : 'Add Category'}
                </h2>

                <p className="mt-1 text-xs text-coffee/50">
                  Category information for the
                  selected branch.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCategoryModalOpen(false)
                }
                className="text-xl text-coffee/50"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold">
                  Category Name *
                </label>

                <input
                  value={categoryName}
                  onChange={(event) =>
                    setCategoryName(
                      event.target.value,
                    )
                  }
                  placeholder="Example: Biryani"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Description
                </label>

                <textarea
                  value={
                    categoryDescription
                  }
                  onChange={(event) =>
                    setCategoryDescription(
                      event.target.value,
                    )
                  }
                  rows={3}
                  placeholder="Category description"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Category Image URL
                </label>

                <input
                  value={categoryImage}
                  onChange={(event) =>
                    setCategoryImage(
                      event.target.value,
                    )
                  }
                  placeholder="https://..."
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />

                <p className="mt-1 text-xs text-coffee/50">
                  File upload will be added to
                  the category module separately.
                </p>
              </div>

              {categoryImage && (
                <img
                  src={getImageUrl(
                    categoryImage,
                  )}
                  alt="Category preview"
                  className="h-32 w-full rounded-xl object-cover"
                />
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCategoryModalOpen(false)
                }
                className="rounded-xl border border-coffee/10 px-5 py-3 text-sm font-bold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-coffee-dark disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editingCategory
                    ? 'Save Changes'
                    : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================
          ITEM MODAL
      ====================================================== */}

      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveItem}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-coffee-dark">
                  {editingItem
                    ? 'Edit Menu Item'
                    : 'Add Menu Item'}
                </h2>

                <p className="mt-1 text-xs text-coffee/50">
                  Menu item information and
                  pricing.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setItemModalOpen(false)
                }
                className="text-xl text-coffee/50"
              >
                ×
              </button>
            </div>

            {/* Selected Branch */}

            <div className="mt-5 rounded-xl bg-cream p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-coffee/50">
                Branch
              </div>

              <div className="mt-1 text-sm font-bold text-coffee-dark">
                {branches.find(
                  (branch) =>
                    branch.id ===
                    selectedBranchId,
                )?.name ||
                  'Selected Branch'}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-bold">
                  Item Name *
                </label>

                <input
                  value={itemName}
                  onChange={(event) =>
                    setItemName(
                      event.target.value,
                    )
                  }
                  placeholder="Example: Chicken Biryani"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Category *
                </label>

                <select
                  value={itemCategoryId}
                  onChange={(event) =>
                    setItemCategoryId(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                >
                  <option value="">
                    Select category
                  </option>

                  {activeCategories.map(
                    (category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ),
                  )}
                </select>

                {activeCategories.length ===
                  0 && (
                  <p className="mt-1 text-xs text-red-600">
                    Create an active category
                    first.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Price *
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={itemPrice}
                  onChange={(event) =>
                    setItemPrice(
                      event.target.value,
                    )
                  }
                  placeholder="250"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Discount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemDiscount}
                  onChange={(event) =>
                    setItemDiscount(
                      event.target.value,
                    )
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />

                <p className="mt-1 text-xs text-coffee/50">
                  Discount is stored as an amount.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold">
                  Preparation Time
                </label>

                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={
                      itemPreparationTime
                    }
                    onChange={(event) =>
                      setItemPreparationTime(
                        event.target.value,
                      )
                    }
                    placeholder="20"
                    className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 pr-16 outline-none"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-coffee/50">
                    min
                  </span>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-bold">
                  Description
                </label>

                <textarea
                  value={itemDescription}
                  onChange={(event) =>
                    setItemDescription(
                      event.target.value,
                    )
                  }
                  rows={3}
                  placeholder="Describe the dish..."
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-bold">
                  Ingredients
                </label>

                <textarea
                  value={itemIngredients}
                  onChange={(event) =>
                    setItemIngredients(
                      event.target.value,
                    )
                  }
                  rows={3}
                  placeholder="Rice, chicken, spices..."
                  className="w-full rounded-xl border border-coffee/10 bg-cream px-4 py-3 outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <div className="text-xs text-coffee/50">
                Images can be added after saving
                the item.
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setItemModalOpen(false)
                  }
                  className="rounded-xl border border-coffee/10 px-5 py-3 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    !selectedBranchId ||
                    activeCategories.length ===
                      0
                  }
                  className="rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-coffee-dark disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingItem
                      ? 'Save Changes'
                      : 'Create Item'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================
          IMAGE MANAGEMENT MODAL
      ====================================================== */}

      {imageModalOpen &&
        selectedItemForImages && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-coffee-dark">
                    Manage Images
                  </h2>

                  <p className="mt-1 text-sm text-coffee/60">
                    {
                      selectedItemForImages.name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    imagePreviewUrls.forEach(
                      (url) =>
                        URL.revokeObjectURL(
                          url,
                        ),
                    );

                    setImageModalOpen(false);
                    setImageFiles([]);
                    setImagePreviewUrls([]);
                  }}
                  className="text-xl text-coffee/50"
                >
                  ×
                </button>
              </div>

              {/* EXISTING IMAGES */}

              <div className="mt-6">
                <div className="mb-3 text-sm font-bold text-coffee-dark">
                  Existing Images
                </div>

                {selectedItemForImages
                  .images.length === 0 ? (
                  <div className="rounded-xl bg-cream p-8 text-center text-sm text-coffee/50">
                    No images uploaded yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {selectedItemForImages.images.map(
                      (image) => (
                        <div
                          key={image.id}
                          className="overflow-hidden rounded-xl border border-coffee/10 bg-cream"
                        >
                          <div className="relative">
                            <img
                              src={getImageUrl(
                                image.url,
                              )}
                              alt={
                                selectedItemForImages.name
                              }
                              className="aspect-square w-full object-cover"
                            />

                            {image.isPrimary && (
                              <span className="absolute left-2 top-2 rounded-full bg-turmeric px-2 py-1 text-[10px] font-bold text-coffee-dark">
                                PRIMARY
                              </span>
                            )}
                          </div>

                          <div className="flex gap-1 p-2">
                            {!image.isPrimary && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPrimaryImage(
                                    image,
                                  )
                                }
                                className="flex-1 rounded-lg bg-white px-2 py-2 text-[10px] font-bold"
                              >
                                Make Primary
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                deleteImage(
                                  image,
                                )
                              }
                              className="rounded-lg bg-white px-2 py-2 text-[10px] font-bold text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              {/* UPLOAD */}

              <div className="mt-8 rounded-2xl border-2 border-dashed border-coffee/10 bg-cream p-5">
                <div className="text-sm font-bold text-coffee-dark">
                  Upload Menu Images
                </div>

                <div className="mt-1 text-xs text-coffee/50">
                  JPG, PNG or WEBP • Maximum 5
                  MB each • Maximum 10 images per
                  item
                </div>

                <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-coffee/10 bg-white p-4 text-center hover:bg-cream">
                  <div className="text-3xl">
                    🖼️
                  </div>

                  <div className="mt-2 text-sm font-bold text-coffee-dark">
                    Choose images
                  </div>

                  <div className="mt-1 text-xs text-coffee/50">
                    On mobile, your device can
                    open the normal photo/file
                    picker.
                  </div>

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={
                      handleImageSelection
                    }
                    className="hidden"
                  />
                </label>

                {imagePreviewUrls.length >
                  0 && (
                  <div className="mt-4">
                    <div className="mb-3 text-sm font-bold">
                      Selected Images
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {imagePreviewUrls.map(
                        (
                          url,
                          index,
                        ) => (
                          <div
                            key={`${url}-${index}`}
                            className="overflow-hidden rounded-xl border border-coffee/10 bg-white"
                          >
                            <img
                              src={url}
                              alt={`Selected ${
                                index + 1
                              }`}
                              className="aspect-square w-full object-cover"
                            />

                            {index === 0 && (
                              <div className="p-2 text-center text-[10px] font-bold text-coffee/60">
                                First image
                                becomes
                                primary when
                                no primary
                                image exists.
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={uploadImages}
                      disabled={uploading}
                      className="mt-4 w-full rounded-xl bg-turmeric px-5 py-3 text-sm font-bold text-coffee-dark disabled:opacity-50"
                    >
                      {uploading
                        ? 'Uploading...'
                        : `Upload ${
                            imageFiles.length
                          } Image${
                            imageFiles.length ===
                            1
                              ? ''
                              : 's'
                          }`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}