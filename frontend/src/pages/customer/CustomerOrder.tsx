import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, API_BASE_URL } from '../../api/client';
import type {
  CustomerBillDTO,
  MenuCategoryDTO,
  MenuItem,
  OrderDTO,
  PlaceQrOrderResponse,
  PublicBranchDTO,
  PublicTableResponse,
  RestaurantTableDTO,
} from '../../types';

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const BRAND_NAME = "Sam's Cafe";
const ALL = 'ALL';

const ORDER_STEPS = [
  { key: 'PENDING', label: 'Order placed', hint: 'We have your order and the kitchen will confirm it shortly.' },
  { key: 'ACCEPTED', label: 'Accepted', hint: 'The kitchen has confirmed your order.' },
  { key: 'PREPARING', label: 'Preparing', hint: 'Your food is being prepared fresh.' },
  { key: 'READY', label: 'Ready', hint: 'Your order is ready and on its way to your table.' },
  { key: 'SERVED', label: 'Served', hint: 'Enjoy your meal. You can add more items or request your final bill.' },
  { key: 'COMPLETED', label: 'Completed', hint: 'This order is complete. Add more items or request the final bill.' },
] as const;

const ORDER_EVENTS = [
  'order.accepted',
  'order.preparing',
  'order.ready',
  'order.served',
  'order.completed',
  'order.cancelled',
];

type CartLine = { item: MenuItem; quantity: number };

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown) {
  return `₹${toNumber(value).toFixed(2)}`;
}

// Backend origin (API_BASE_URL without the trailing /api). Used for Socket.IO
// and for resolving uploaded images/logos so they never hit the Vite server.
function serverOrigin() {
  return String(API_BASE_URL).replace(/\/api\/?$/, '');
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${serverOrigin()}${url.startsWith('/') ? url : `/${url}`}`;
}

function primaryImageUrl(item: MenuItem) {
  return (
    item.images?.find((image) => image.isPrimary)?.url ||
    item.images?.[0]?.url ||
    null
  );
}

function errorMessage(err: unknown, fallback: string) {
  const e = err as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  } | null;

  return (
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    e?.message ||
    fallback
  );
}


function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

const IconSearch = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
const IconPlus = ({ size = 18 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconMinus = ({ size = 18 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M5 12h14" />
  </svg>
);
const IconClose = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconCheck = ({ size = 16 }: { size?: number }) => (
  <svg {...svgProps(size)} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const IconBag = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M6 8h12l-1 12H7L6 8z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </svg>
);
const IconUtensils = ({ size = 28 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" />
    <path d="M17 21V3c-2.5 1.5-4 4.5-4 8h4" />
  </svg>
);
const IconTag = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M3 12V4h8l10 10-8 8L3 12z" />
    <circle cx="7.5" cy="8.5" r="1" />
  </svg>
);
const IconPrint = ({ size = 20 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <path d="M7 9V3h10v6" />
    <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);
const IconAlert = ({ size = 22 }: { size?: number }) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Small presentational components                                     */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="qo-root">
      <style>{STYLES}</style>
      {children}
    </div>
  );
}

function BrandMark({
  src,
  name,
  size = 60,
}: {
  src: string;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className="qo-mark"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {showImage ? (
        <img src={src} alt={`${name} logo`} onError={() => setFailed(true)} />
      ) : (
        <span className="qo-display">
          {(name.trim().charAt(0) || 'S').toUpperCase()}
        </span>
      )}
    </div>
  );
}

function FoodImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'error'
  );

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  return (
    <div className="qo-img-wrap">
      {src && status !== 'error' && (
        <img
          className={`qo-img${status === 'loaded' ? ' is-loaded' : ''}`}
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
      {status === 'loading' && <div className="qo-shimmer" />}
      {status === 'error' && (
        <div className="qo-img-fallback" aria-hidden="true">
          <IconUtensils />
        </div>
      )}
    </div>
  );
}

function Hero({
  logoSrc,
  branch,
  tableNumber,
  compact,
}: {
  logoSrc: string;
  branch: PublicBranchDTO | null;
  tableNumber?: number;
  compact?: boolean;
}) {
  const branchLabel =
    branch && branch.name.trim().toLowerCase() !== BRAND_NAME.toLowerCase()
      ? branch.name
      : '';
  const subtitle = [branchLabel, branch?.address].filter(Boolean).join(', ');

  return (
    <header className={`qo-hero${compact ? ' is-compact' : ''} qo-noprint`}>
      <div className="qo-wrap qo-hero-inner">
        <div className="qo-brand">
          <BrandMark src={logoSrc} name={BRAND_NAME} size={compact ? 52 : 64} />
          <div style={{ minWidth: 0 }}>
            <h1 className="qo-display qo-brand-name">{BRAND_NAME}</h1>
            {subtitle && <p className="qo-brand-sub">{subtitle}</p>}
          </div>
        </div>

        {tableNumber !== undefined && (
          <div className="qo-seat" aria-label={`Dine-in, table ${tableNumber}`}>
            <span className="qo-seat-label">Table</span>
            <span className="qo-display qo-seat-num">{tableNumber}</span>
            <span className="qo-seat-note">Dine-in</span>
          </div>
        )}
      </div>
    </header>
  );
}

function StateCard({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="qo-state" role="alert">
      <div className="qo-state-icon">
        <IconAlert />
      </div>
      <h2 className="qo-display qo-state-title">{title}</h2>
      <p className="qo-muted">{message}</p>
      {actionLabel && onAction && (
        <button type="button" className="qo-outline-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      <div
        className="qo-skel"
        style={{ height: 28, width: 170, marginTop: 26, borderRadius: 8 }}
      />
      <div className="qo-list">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className="qo-row" key={index}>
            <div>
              <div className="qo-skel" style={{ height: 18, width: '70%', borderRadius: 6 }} />
              <div className="qo-skel" style={{ height: 13, width: '95%', marginTop: 12, borderRadius: 6 }} />
              <div className="qo-skel" style={{ height: 13, width: '60%', marginTop: 8, borderRadius: 6 }} />
              <div className="qo-skel" style={{ height: 18, width: 64, marginTop: 16, borderRadius: 6 }} />
            </div>
            <div className="qo-skel" style={{ width: 116, height: 116, borderRadius: 20 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuRow({
  item,
  quantity,
  onAdd,
  onSub,
}: {
  item: MenuItem;
  quantity: number;
  onAdd: (id: string) => void;
  onSub: (id: string) => void;
}) {
  const src = resolveAssetUrl(primaryImageUrl(item));

  return (
    <article className="qo-row">
      <div className="qo-row-text">
        <h3 className="qo-display qo-row-name">{item.name}</h3>
        {item.description && <p className="qo-row-desc">{item.description}</p>}
        <span className="qo-price">{money(item.price)}</span>
      </div>

      <div className="qo-row-media">
        <div className="qo-row-photo">
          <FoodImage src={src} alt={item.name} />
        </div>

        <div className="qo-row-action">
          {quantity > 0 ? (
            <div className="qo-stepper" role="group" aria-label={`${item.name} quantity`}>
              <button type="button" onClick={() => onSub(item.id)} aria-label={`Remove one ${item.name}`}>
                <IconMinus />
              </button>
              <span className="qo-qty" key={quantity} aria-live="polite">
                {quantity}
              </span>
              <button type="button" onClick={() => onAdd(item.id)} aria-label={`Add one more ${item.name}`}>
                <IconPlus />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="qo-add"
              onClick={() => onAdd(item.id)}
              aria-label={`Add ${item.name} to order`}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function OrderTracker({ status }: { status: string }) {
  const currentIndex = ORDER_STEPS.findIndex((step) => step.key === status);
  const current = ORDER_STEPS[currentIndex >= 0 ? currentIndex : 0];

  return (
    <>
      <section className="qo-status" aria-live="polite">
        <p className="qo-muted" style={{ margin: 0 }}>
          Your order status
        </p>
        <h2 className="qo-display qo-status-title" key={current.key}>
          {current.label}
        </h2>
        <p className="qo-muted" style={{ margin: '6px 0 0' }}>
          {current.hint}
        </p>

        <div className="qo-segs" aria-hidden="true">
          {ORDER_STEPS.map((step, index) => (
            <span
              key={step.key}
              className={`qo-seg${
                index < currentIndex || (index === currentIndex && step.key === 'COMPLETED')
                  ? ' is-done'
                  : index === currentIndex
                  ? ' is-current'
                  : ''
              }`}
            />
          ))}
        </div>
      </section>

      <section className="qo-panel" aria-label="Order progress">
        <ol className="qo-steps">
          {ORDER_STEPS.map((step, index) => {
            const done =
              index < currentIndex ||
              (index === currentIndex && step.key === 'COMPLETED');
            const isCurrent = index === currentIndex && !done;

            return (
              <li
                key={step.key}
                className={`qo-step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
              >
                <span className="qo-dot">{done ? <IconCheck /> : null}</span>
                <div>
                  <div className="qo-step-label">{step.label}</div>
                  {isCurrent && <div className="qo-step-hint">{step.hint}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function BillCard({
  bill,
  logoSrc,
  tableNumber,
  onPrint,
}: {
  bill: CustomerBillDTO;
  logoSrc: string;
  tableNumber?: number;
  onPrint: () => void;
}) {
  const lines = (bill.items ?? []).flatMap((entry) => entry.order?.items ?? []);
  const paid = String(bill.paymentStatus).toUpperCase() === 'PAID';
  const date = formatDate(bill.createdAt);

  return (
    <div id="customer-bill" className="qo-bill">
      <div className="qo-bill-head">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BrandMark src={logoSrc} name={BRAND_NAME} size={56} />
        </div>
        <h2 className="qo-display" style={{ fontSize: 24, margin: '10px 0 0' }}>
          {BRAND_NAME}
        </h2>
        <p className="qo-muted" style={{ margin: '2px 0 0' }}>
          Customer bill
        </p>
        <p style={{ margin: '10px 0 0', fontWeight: 700 }}>Bill #{bill.billNumber}</p>
        {tableNumber !== undefined && <p style={{ margin: 0 }}>Table {tableNumber}</p>}
        {date && (
          <p className="qo-muted" style={{ margin: 0, fontSize: 13 }}>
            {date}
          </p>
        )}
      </div>

      <div className="qo-bill-lines">
        {lines.map((line) => (
          <div className="qo-bill-line" key={line.id}>
            <span>
              {line.quantity} × {line.nameSnapshot}
            </span>
            <span>{money(toNumber(line.priceSnapshot) * line.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="qo-bill-sums">
        <div className="qo-sum-row">
          <span>Subtotal</span>
          <span>{money(bill.subtotal)}</span>
        </div>
        <div className="qo-sum-row">
          <span>Discount</span>
          <span>-{money(bill.discount)}</span>
        </div>
        <div className="qo-sum-row">
          <span>Tax</span>
          <span>{money(bill.tax)}</span>
        </div>
        <div className="qo-sum-row is-total">
          <span>Total</span>
          <span>{money(bill.total)}</span>
        </div>
      </div>

      <div className={`qo-pay${paid ? ' is-paid' : ''}`}>
        <div>
          Payment status: <strong>{bill.paymentStatus}</strong>
        </div>
        {!paid && <div className="qo-muted">Please pay the restaurant staff.</div>}
      </div>

      <button type="button" className="qo-primary qo-noprint" onClick={onPrint}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconPrint /> Print or save PDF
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CustomerOrder() {
  // The QR URL carries ?tableId=... When present, the customer never has to
  // pick a branch or table manually.
  const [qrTableIdParam] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('tableId')
  );
  const qrTableMode = Boolean(qrTableIdParam);

  const [loadingQrTable, setLoadingQrTable] = useState(qrTableMode);
  const [qrError, setQrError] = useState('');

  const [branches, setBranches] = useState<PublicBranchDTO[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branch, setBranch] = useState<PublicBranchDTO | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [tables, setTables] = useState<RestaurantTableDTO[]>([]);
  const [tableId, setTableId] = useState<string | null>(null);

  const [categories, setCategories] = useState<MenuCategoryDTO[]>([]);
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItem[]>>({});
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [menuReloadKey, setMenuReloadKey] = useState(0);
  const [search, setSearch] = useState('');

  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState<
  Array<{
    id: string;
    code: string;
    description?: string | null;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number | string;
    minOrder: number | string;
    maxDiscount?: number | string | null;
    expiryDate: string;
    branchId?: string | null;
  }>
>([]);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponsError, setCouponsError] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState('');

  const [activeOrder, setActiveOrder] = useState<OrderDTO | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderDTO[]>([]);
  const [qrToken, setQrToken] = useState('');
  const [bill, setBill] = useState<CustomerBillDTO | null>(null);
  const [finalBillLoading, setFinalBillLoading] = useState(false);
  const [billError, setBillError] = useState(false);
  const [liveWarning, setLiveWarning] = useState(false);

  const [error, setError] = useState('');

  const qrSocketRef = useRef<Socket | null>(null);
  const activeOrderIdRef = useRef<string | null>(null);

  /* ---------- QR table -> branch -> logo ---------- */

  useEffect(() => {
    if (!qrTableIdParam) return;

    let cancelled = false;
    setLoadingQrTable(true);
    setQrError('');

    api
      .get<PublicTableResponse>(`/tables/public/${encodeURIComponent(qrTableIdParam)}`)
      .then((res) => {
        if (cancelled) return;
        const table = res.data.table;

        setTableId(table.id);
        setBranchId(table.branchId);
        setBranch(table.branch ?? null);
        setTables([table]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQrError(errorMessage(err, 'We could not open this table.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingQrTable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qrTableIdParam]);

  /* ---------- Manual flow (no QR): branches, then tables ---------- */

  useEffect(() => {
    if (qrTableMode) return;

    let cancelled = false;
    setBranchesLoading(true);

    api
      .get<{ branches: PublicBranchDTO[] }>('/branches/public')
      .then((res) => {
        if (!cancelled) setBranches(res.data.branches ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError('We could not load the restaurant branches. Please refresh and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [qrTableMode]);

  useEffect(() => {
    if (!branchId || qrTableMode) return;

    let cancelled = false;

    api
      .get<{ tables: RestaurantTableDTO[] }>('/tables', { params: { branchId } })
      .then((res) => {
        if (!cancelled) setTables(res.data.tables ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError('We could not load the tables for this branch. Please try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, qrTableMode]);

  /* ---------- Menu: categories, then items for every category ---------- */

  useEffect(() => {
    if (!branchId) return;

    let cancelled = false;
    setMenuLoading(true);
    setMenuError('');

    (async () => {
      try {
        const categoryResponse = await api.get<{ categories: MenuCategoryDTO[] }>(
          '/categories',
          { params: { branchId } }
        );
        const loadedCategories = categoryResponse.data.categories ?? [];

        const results = await Promise.all(
          loadedCategories.map((category) =>
            api
              .get<{ items: MenuItem[] }>('/items', {
                params: { branchId, categoryId: category.id },
              })
              .then((res) => [category.id, res.data.items ?? []] as const)
          )
        );

        if (cancelled) return;

        setCategories(loadedCategories);
        setItemsByCategory(Object.fromEntries(results));
        setCategoryId((current) =>
          current === ALL || loadedCategories.some((category) => category.id === current)
            ? current
            : ALL
        );
      } catch {
        if (!cancelled) {
          setMenuError('We could not load the menu right now.');
        }
      } finally {
        if (!cancelled) setMenuLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, menuReloadKey]);

  /* ---------- Final bill ---------- */

  const orderStatus = activeOrder?.status;

  /* ---------- Live order updates (Socket.IO) ---------- */

  useEffect(() => {
  if (!qrToken || !activeOrderIdRef.current) return;
    const socket = io(serverOrigin(), {
      transports: ['websocket'],
      auth: { qrToken },
    });

    qrSocketRef.current = socket;

    const handleOrder = (updated: OrderDTO) => {
      if (activeOrderIdRef.current && updated.id !== activeOrderIdRef.current) {
        return;
      }

      setActiveOrder((previous) =>
        previous
          ? {
              ...previous,
              ...updated,
              items: updated.items?.length ? updated.items : previous.items,
            }
          : updated
      );
    };

    
    ORDER_EVENTS.forEach((event) => {
      socket.on(event, handleOrder);
    });

    
    socket.on('connect', () => setLiveWarning(false));
    socket.on('connect_error', () => setLiveWarning(true));

    return () => {
      ORDER_EVENTS.forEach((event) => {
        socket.off(event, handleOrder);
      });

      socket.disconnect();

      if (qrSocketRef.current === socket) {
        qrSocketRef.current = null;
      }
    };
  }, [qrToken, activeOrder?.id]);

  /* ---------- Derived menu / cart data ---------- */

  const activeItemsByCategory = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};

    categories.forEach((category) => {
      map[category.id] = (itemsByCategory[category.id] ?? []).filter(
        (item) => item.status !== 'INACTIVE'
      );
    });

    return map;
  }, [categories, itemsByCategory]);

  const itemIndex = useMemo(() => {
    const map: Record<string, MenuItem> = {};

    Object.values(activeItemsByCategory).forEach((list) => {
      list.forEach((item) => {
        map[item.id] = item;
      });
    });

    return map;
  }, [activeItemsByCategory]);

  const totalMenuItems = Object.keys(itemIndex).length;
  const query = search.trim().toLowerCase();

  const sections = useMemo(() => {
    if (query) {
      const found = categories
        .flatMap((category) => activeItemsByCategory[category.id] ?? [])
        .filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            (item.description ?? '').toLowerCase().includes(query)
        );

      return found.length
        ? [{ id: 'search', title: 'Search results', items: found }]
        : [];
    }

    const visibleCategories =
      categoryId === ALL
        ? categories
        : categories.filter((category) => category.id === categoryId);

    return visibleCategories
      .map((category) => ({
        id: category.id,
        title: category.name,
        items: activeItemsByCategory[category.id] ?? [],
      }))
      .filter((section) => section.items.length > 0);
  }, [query, categories, categoryId, activeItemsByCategory]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart).flatMap(([itemId, quantity]): CartLine[] => {
        const item = itemIndex[itemId];
        return item && quantity > 0 ? [{ item, quantity }] : [];
      }),
    [cart, itemIndex]
  );

  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartSubtotal = cartLines.reduce(
    (sum, line) => sum + toNumber(line.item.price) * line.quantity,
    0
  );

  // Lock page scroll while the cart sheet is open; Escape closes it.
  useEffect(() => {
    if (!cartOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCartOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [cartOpen]);

  useEffect(() => {
    if (cartOpen && cartCount === 0) setCartOpen(false);
  }, [cartOpen, cartCount]);

  /* ---------- Actions ---------- */

  function addToCart(itemId: string) {
    setCart((current) => ({
      ...current,
      [itemId]: (current[itemId] || 0) + 1,
    }));
  }

  function subFromCart(itemId: string) {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[itemId] || 0) - 1;

      if (quantity > 0) {
        next[itemId] = quantity;
      } else {
        delete next[itemId];
      }

      return next;
    });
  }
  async function loadAvailableCoupons() {
    if (!branchId) {
      setCouponsError('Restaurant branch is not available.');
      return;
    }

    setCouponsLoading(true);
    setCouponsError('');

    try {
      const response = await api.get('/coupons/available', {
        params: { branchId },
      });

      const coupons = Array.isArray(response.data?.coupons)
        ? response.data.coupons
        : [];

      setAvailableCoupons(coupons);
      setCouponsOpen(true);
    } catch (err: unknown) {
      const message = errorMessage(
        err,
        'Unable to load available coupons.',
      );

      setAvailableCoupons([]);
      setCouponsError(message);
      setCouponsOpen(true);
    } finally {
      setCouponsLoading(false);
    }
  }

  function selectAvailableCoupon(
    coupon: (typeof availableCoupons)[number],
  ) {
    setAppliedCoupon(coupon.code.toUpperCase());
    setCouponInput('');
    setCouponsOpen(false);
    setOrderError('');
  }

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();

    if (!code) {
      setOrderError('Please enter a coupon code.');
      return;
    }

    setAppliedCoupon(code);
    setCouponInput('');
    setOrderError('');
  }

  function removeCoupon() {
    setAppliedCoupon('');
    setCouponInput('');
    setOrderError('');
  }

  async function placeOrder() {
    if (placing) return;

    setOrderError('');

    if (!tableId) {
      setOrderError('Please select a restaurant table before placing your order.');
      return;
    }

    if (cartLines.length === 0) {
      setOrderError('Please add at least one item to your order.');
      return;
    }
    if (customerName.trim().length < 2) {
      setOrderError('Please enter your name before placing the order.');
      return;
    }
    const normalizedPhone = customerPhone.replace(/[\\s()-]/g, '');
    if (!/^\\+?[0-9]{7,15}$/.test(normalizedPhone)) {
      setOrderError('Please enter a valid phone number before placing the order.');
      return;
    }

    setPlacing(true);

    try {
      const payload: Record<string, unknown> = {
        tableId,
        customerName: customerName.trim(),
        customerPhone: normalizedPhone,
        items: cartLines.map((line) => ({
          itemId: line.item.id,
          quantity: line.quantity,
        })),
      };

      const note = specialInstructions.trim();
      if (note) payload.specialInstructions = note;

      const response = await api.post<PlaceQrOrderResponse>('/orders/qr', payload);

      const order = response.data.order;
      const token = response.data.qrToken;

      activeOrderIdRef.current = order.id;

      setActiveOrder(order);
      setQrToken(token || '');
      setReviewRating(0);
      setReviewComment('');
      setReviewSubmitted(false);
      setReviewError('');
      setBill(null);
      setBillError(false);
      setLiveWarning(false);
      setCart({});
      setAppliedCoupon('');
      setCouponInput('');
      setSpecialInstructions('');
      setCartOpen(false);

      if (token) {
        try {
          sessionStorage.setItem(`samsrs:qr-token:${order.id}`, token);
        } catch {
          // Storage can be blocked (private mode); the order still works.
        }
      }
    } catch (err: unknown) {
      setOrderError(errorMessage(err, 'We could not place your order. Please try again.'));
    } finally {
      setPlacing(false);
    }
  }

  async function submitReview() {
    if (!activeOrder || reviewSubmitting || reviewSubmitted) return;
    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Please select a star rating from 1 to 5.');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    try {
      await api.post('/reviews', {
        orderId: activeOrder.id,
        qrToken,
        restaurantRating: reviewRating,
        text: reviewComment.trim(),
      });
      setReviewSubmitted(true);
    } catch (err: unknown) {
      setReviewError(errorMessage(err, 'We could not submit your feedback. Please try again.'));
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function generateFinalBill() {
    if (!qrToken || !activeOrder || activeOrder.status !== 'COMPLETED') {
      setOrderError(
        'Please wait until your current order is completed before requesting the final bill.',
      );
      return;
    }

    if (finalBillLoading) return;

    setFinalBillLoading(true);
    setBillError(false);
    setOrderError('');

    try {
      const response = await api.post<{ bill: CustomerBillDTO }>(
        `/bills/qr/${encodeURIComponent(qrToken)}/finalize`,
        appliedCoupon ? { couponCode: appliedCoupon } : {},
      );

      setBill(response.data.bill);
      setBillError(false);
    } catch (err: unknown) {
      setBillError(true);
      setOrderError(
        errorMessage(
          err,
          'We could not generate the final bill yet. Please try again.',
        ),
      );
    } finally {
      setFinalBillLoading(false);
    }
  }

  function addMoreItems() {
  if (activeOrder) {
    setOrderHistory((current) => {
      if (current.some((order) => order.id === activeOrder.id)) {
        return current;
      }

      return [...current, activeOrder];
    });
  }

  if (qrSocketRef.current) {
    qrSocketRef.current.disconnect();
    qrSocketRef.current = null;
  }

  activeOrderIdRef.current = null;

  setActiveOrder(null);
  setBill(null);
  setBillError(false);
  setLiveWarning(false);
  setCart({});
  setAppliedCoupon('');
  setCouponInput('');
  setSpecialInstructions('');
  setOrderError('');
  setError('');
}

  function printBill() {
    window.print();
  }

  /* ---------- Shared values for rendering ---------- */

  const logoSrc = resolveAssetUrl(branch?.logoUrl);
  const tableNumber = tables.find((table) => table.id === tableId)?.number;

  /* ---------- Screen: opening QR table ---------- */

  if (loadingQrTable) {
    return (
      <Shell>
        <div className="qo-loading" aria-busy="true">
          <div className="qo-loading-mark">
            <BrandMark src="" name={BRAND_NAME} size={84} />
          </div>
          <h1 className="qo-display" style={{ fontSize: 26, margin: '18px 0 4px' }}>
            {BRAND_NAME}
          </h1>
          <p className="qo-muted" style={{ margin: 0 }}>
            Opening your table menu...
          </p>
          <div className="qo-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------- Screen: QR table could not be opened ---------- */

  if (qrTableMode && qrError && !tableId) {
    return (
      <Shell>
        <Hero logoSrc="" branch={null} />
        <div className="qo-body">
          <div className="qo-wrap">
            <StateCard
              title="We could not open this table"
              message={`${qrError} Please scan the QR code on your table again, or ask a member of staff for help.`}
              actionLabel="Try again"
              onAction={() => window.location.reload()}
            />
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------- Screen: order tracking & bill ---------- */

  if (activeOrder) {
    const tableNumberForBill =
      bill?.items?.[0]?.order?.tableSession?.table?.number ?? tableNumber;
    const cancelled = activeOrder.status === 'CANCELLED';
    const completed = activeOrder.status === 'COMPLETED';
    const orderLines = activeOrder.items ?? [];

    return (
      <Shell>
        <Hero logoSrc={logoSrc} branch={branch} tableNumber={tableNumberForBill} compact />

        <div className="qo-body">
          <div className="qo-wrap qo-stack">
            {orderHistory.length > 0 && (
  <section className="qo-panel qo-noprint">
    <h3 className="qo-display qo-panel-title">Your previous orders</h3>

    <div className="qo-history-list">
      {orderHistory.map((order) => (
        <div className="qo-history-card" key={order.id}>
          <div className="qo-history-head">
            <strong>Order #{order.orderNumber}</strong>
            <span className="qo-history-status">
              {order.status}
            </span>
          </div>

          <ul className="qo-order-items">
            {(order.items ?? []).map((line) => (
              <li key={line.id}>
                <span>
                  {line.quantity} × {line.nameSnapshot}
                </span>
                <span>
                  {money(toNumber(line.priceSnapshot) * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="qo-sum-row is-total">
            <span>Order total</span>
            <span>{money(order.total)}</span>
          </div>
        </div>
      ))}
    </div>
  </section>
)}
            <div className="qo-noprint qo-stack">
              <div className="qo-order-head">
                <h2 className="qo-display" style={{ fontSize: 28, margin: 0 }}>
                  Order #{activeOrder.orderNumber}
                </h2>
              </div>

              {liveWarning && !completed && !cancelled && (
                <div className="qo-alert is-info" role="status">
                  <IconAlert size={20} />
                  <span>
                    Live updates are reconnecting. Your order is still active and the
                    kitchen can see it.
                  </span>
                </div>
              )}

              {cancelled ? (
                <StateCard
                  title="This order was cancelled"
                  message="Please speak to a member of staff, or start a new order."
                />
              ) : (
                <OrderTracker status={activeOrder.status} />
              )}

              {['SERVED', 'COMPLETED'].includes(activeOrder.status) && (
                <section className="qo-panel qo-noprint" aria-label="Feedback and review">
                  <h3 className="qo-display qo-panel-title">How was your experience?</h3>
                  {reviewSubmitted ? (
                    <p className="qo-muted" role="status">Thank you! Your feedback has been submitted.</p>
                  ) : (
                    <>
                      <p className="qo-muted" style={{ marginTop: 0 }}>Rate your experience and tell us what we can improve.</p>
                      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }} role="group" aria-label="Rate your experience">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button key={star} type="button" onClick={() => setReviewRating(star)} aria-label={`${star} star`} aria-pressed={reviewRating === star} style={{ border: 0, background: 'transparent', color: star <= reviewRating ? '#d49a19' : '#b7b0a7', fontSize: 32, cursor: 'pointer', padding: 0 }}>
                            ★
                          </button>
                        ))}
                      </div>
                      <label className="qo-note">
                        <span className="qo-note-label">Comments (optional)</span>
                        <textarea className="qo-input" rows={3} maxLength={1000} placeholder="Share your feedback..." value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} />
                      </label>
                      {reviewError && <div className="qo-alert" role="alert" style={{ marginTop: 12 }}>{reviewError}</div>}
                      <button type="button" className="qo-primary" style={{ marginTop: 14 }} onClick={() => void submitReview()} disabled={reviewSubmitting || reviewRating === 0}>
                        {reviewSubmitting ? 'Submitting feedback…' : 'Submit Feedback'}
                      </button>
                    </>
                  )}
                </section>
              )}

              <section className="qo-panel">
                <h3 className="qo-display qo-panel-title">Your items</h3>
                <ul className="qo-order-items">
                  {orderLines.map((line) => (
                    <li key={line.id}>
                      <span>
                        {line.quantity} × {line.nameSnapshot}
                      </span>
                      <span>{money(toNumber(line.priceSnapshot) * line.quantity)}</span>
                    </li>
                  ))}
                </ul>

                <div className="qo-sums">
                  <div className="qo-sum-row">
                    <span>Subtotal</span>
                    <span>{money(activeOrder.subtotal)}</span>
                  </div>
                  {toNumber(activeOrder.discountAmount) > 0 && (
                    <div className="qo-sum-row is-discount">
                      <span>Discount</span>
                      <span>-{money(activeOrder.discountAmount)}</span>
                    </div>
                  )}
                  {activeOrder.taxAmount !== undefined && (
                    <div className="qo-sum-row">
                      <span>Tax</span>
                      <span>{money(activeOrder.taxAmount)}</span>
                    </div>
                  )}
                  <div className="qo-sum-row is-total">
                    <span>Order total</span>
                    <span>{money(activeOrder.total)}</span>
                  </div>
                </div>
              </section>
            </div>

            {completed && (
              <div className="qo-stack">
                {!bill && (
                  <section className="qo-panel qo-noprint">
                    <div className="qo-done-badge">
                      <IconCheck size={18} /> Order completed
                    </div>

                    <p className="qo-muted" style={{ margin: '10px 0 14px' }}>
                      This batch has been completed. Your table session is still open,
                      so you can add more items or generate the final combined bill.
                    </p>

                    <div className="qo-final-actions">
                      <button
                        type="button"
                        className="qo-outline-btn"
                        onClick={addMoreItems}
                        disabled={finalBillLoading}
                      >
                        Add More Items
                      </button>

                      <button
                        type="button"
                        className="qo-primary"
                        onClick={() => void generateFinalBill()}
                        disabled={finalBillLoading}
                      >
                        {finalBillLoading ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, margin: '0 auto' }}>
                            <span className="qo-spinner" aria-hidden="true" />
                            Generating final bill
                          </span>
                        ) : (
                          <>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <IconBag /> Final Bill
                            </span>
                            <span>Generate</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="qo-offer" style={{ marginTop: 16 }}>
                      <div className="qo-offer-header">
                        <div className="qo-offer-title">
                          <IconTag /> Coupon for final bill
                        </div>
                        <button
                          type="button"
                          className="qo-view-coupons"
                          onClick={() => void loadAvailableCoupons()}
                          disabled={couponsLoading || finalBillLoading}
                        >
                          {couponsLoading ? 'Loading...' : 'View Coupons'}
                        </button>
                      </div>

                      {appliedCoupon ? (
                        <div className="qo-coupon-applied">
                          <span>
                            <strong>{appliedCoupon}</strong> selected
                          </span>
                          <button
                            type="button"
                            className="qo-link-btn"
                            onClick={removeCoupon}
                            disabled={finalBillLoading}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="qo-offer-row">
                          <input
                            className="qo-input"
                            placeholder="Enter coupon code"
                            aria-label="Final bill coupon code"
                            value={couponInput}
                            onChange={(event) =>
                              setCouponInput(event.target.value.toUpperCase())
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') applyCoupon();
                            }}
                            disabled={finalBillLoading}
                          />
                          <button
                            type="button"
                            className="qo-apply"
                            onClick={applyCoupon}
                            disabled={!couponInput.trim() || finalBillLoading}
                          >
                            Apply
                          </button>
                        </div>
                      )}

                      <p className="qo-offer-note">
                        The coupon is applied only when the final combined bill is generated.
                        The restaurant server remains the final authority on eligibility.
                      </p>

                      {couponsError && (
                        <p className="qo-offer-note qo-offer-error">
                          {couponsError}
                        </p>
                      )}
                    </div>

                    {couponsOpen && (
                      <div
                        className="qo-coupon-overlay"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Available coupons"
                        onClick={() => setCouponsOpen(false)}
                      >
                        <div
                          className="qo-coupon-modal"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="qo-coupon-modal-head">
                            <div>
                              <h3 className="qo-display" style={{ fontSize: 22 }}>
                                Available coupons
                              </h3>
                              <p className="qo-muted" style={{ marginTop: 4, fontSize: 13 }}>
                                Choose an offer for your final combined bill.
                              </p>
                            </div>

                            <button
                              type="button"
                              className="qo-icon-btn"
                              onClick={() => setCouponsOpen(false)}
                              aria-label="Close available coupons"
                            >
                              <IconClose />
                            </button>
                          </div>

                          <div className="qo-coupon-list">
                            {availableCoupons.length === 0 ? (
                              <div className="qo-coupon-empty">
                                <IconTag size={28} />
                                <strong>No coupons available</strong>
                                <span>
                                  There are no active offers available for this branch right now.
                                </span>
                              </div>
                            ) : (
                              availableCoupons.map((coupon) => {
                                const discountValue = toNumber(coupon.discountValue);
                                const minimum = toNumber(coupon.minOrder);
                                const expiry = new Date(coupon.expiryDate);
                                const expiryText = Number.isNaN(expiry.getTime())
                                  ? ''
                                  : expiry.toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    });

                                return (
                                  <button
                                    type="button"
                                    key={coupon.id}
                                    className="qo-coupon-card"
                                    onClick={() => selectAvailableCoupon(coupon)}
                                  >
                                    <div className="qo-coupon-card-top">
                                      <span className="qo-coupon-code">{coupon.code}</span>
                                      <span className="qo-coupon-value">
                                        {coupon.discountType === 'PERCENTAGE'
                                          ? `${discountValue}% OFF`
                                          : `${money(discountValue)} OFF`}
                                      </span>
                                    </div>

                                    {coupon.description && (
                                      <p className="qo-coupon-description">
                                        {coupon.description}
                                      </p>
                                    )}

                                    <div className="qo-coupon-meta">
                                      <span>Min order: {money(minimum)}</span>
                                      {coupon.maxDiscount !== null &&
                                        coupon.maxDiscount !== undefined && (
                                          <span>Max: {money(coupon.maxDiscount)}</span>
                                        )}
                                      <span>Expires: {expiryText || '—'}</span>
                                    </div>

                                    <div className="qo-coupon-card-bottom">
                                      <span>
                                        The server will validate this coupon against the final bill.
                                      </span>
                                      <span className="qo-coupon-select">Use coupon</span>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {billError && (
                      <div className="qo-alert" role="alert" style={{ marginTop: 14 }}>
                        <IconAlert size={20} />
                        <span>
                          We could not generate the final bill. Please try again.
                        </span>
                      </div>
                    )}
                  </section>
                )}

                {bill && (
                  <>
                    <BillCard
                      bill={bill}
                      logoSrc={logoSrc}
                      tableNumber={tableNumberForBill}
                      onPrint={printBill}
                    />

                    {String(bill.paymentStatus).toUpperCase() !== 'PAID' && (
                      <div className="qo-alert is-info qo-noprint" role="status">
                        <IconAlert size={20} />
                        <span>
                          Your final bill is ready. Please pay the restaurant staff.
                          The table will become available after payment is recorded.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {cancelled && (
              <button
                type="button"
                className="qo-outline-btn qo-noprint"
                onClick={addMoreItems}
              >
                Start Another Order
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  /* ---------- Screen: browse & order ---------- */

  const menuReady = Boolean(branchId && tableId);

  return (
    <Shell>
      <Hero logoSrc={logoSrc} branch={branch} tableNumber={menuReady ? tableNumber : undefined} />

      <div className="qo-body">
        {error && (
          <div className="qo-wrap" style={{ paddingTop: 18 }}>
            <div className="qo-alert" role="alert">
              <IconAlert size={20} />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Manual flow: choose a branch */}
        {!qrTableMode && !branchId && (
          <div className="qo-wrap qo-stack" style={{ paddingTop: 22, paddingBottom: 40 }}>
            <h2 className="qo-display" style={{ fontSize: 24, margin: 0 }}>
              Choose a branch
            </h2>

            {branchesLoading && (
              <>
                <div className="qo-skel" style={{ height: 76, borderRadius: 18 }} />
                <div className="qo-skel" style={{ height: 76, borderRadius: 18 }} />
              </>
            )}

            {!branchesLoading && branches.length === 0 && !error && (
              <StateCard
                title="No branches available"
                message="Please ask a member of staff to help you place your order."
              />
            )}

            {branches.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="qo-choice"
                onClick={() => {
                  setBranchId(entry.id);
                  setBranch(entry);
                }}
              >
                <BrandMark src={resolveAssetUrl(entry.logoUrl)} name={entry.name} size={48} />
                <span>
                  <span className="qo-choice-title">{entry.name}</span>
                  <span className="qo-muted qo-choice-sub">{entry.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Manual flow: choose a table */}
        {!qrTableMode && branchId && !tableId && (
          <div className="qo-wrap qo-stack" style={{ paddingTop: 22, paddingBottom: 40 }}>
            <h2 className="qo-display" style={{ fontSize: 24, margin: 0 }}>
              Choose your table
            </h2>

            <div className="qo-table-grid">
              {tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  className="qo-table-btn"
                  disabled={table.status !== 'AVAILABLE'}
                  onClick={() => setTableId(table.id)}
                >
                  <span className="qo-muted" style={{ fontSize: 12 }}>
                    Table
                  </span>
                  <span className="qo-display" style={{ fontSize: 26, lineHeight: 1 }}>
                    {table.number}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="qo-outline-btn"
              onClick={() => {
                setBranchId(null);
                setBranch(null);
                setTables([]);
                setCategories([]);
                setItemsByCategory({});
              }}
            >
              Choose a different branch
            </button>
          </div>
        )}

        {/* Menu */}
        {menuReady && (
          <>
            <div className="qo-bar">
              <div className="qo-wrap">
                <div className="qo-search">
                  <IconSearch />
                  <input
                    type="search"
                    inputMode="search"
                    placeholder="Search the menu"
                    aria-label="Search the menu"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      className="qo-search-clear"
                      aria-label="Clear search"
                      onClick={() => setSearch('')}
                    >
                      <IconClose size={18} />
                    </button>
                  )}
                </div>

                {categories.length > 0 && !query && (
                  <div className="qo-cats" role="tablist" aria-label="Menu categories">
                    {[{ id: ALL, name: 'All' }, ...categories].map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        role="tab"
                        aria-selected={categoryId === category.id}
                        className={`qo-pill${categoryId === category.id ? ' is-active' : ''}`}
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          setCategoryId(category.id);
                          event.currentTarget.scrollIntoView({
                            behavior: 'smooth',
                            inline: 'center',
                            block: 'nearest',
                          });
                        }}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={`qo-wrap${cartCount > 0 ? ' qo-pad-cart' : ' qo-pad'}`}>
              {menuLoading && <MenuSkeleton />}

              {!menuLoading && menuError && (
                <StateCard
                  title="We could not load the menu"
                  message={`${menuError} Check your connection and try again.`}
                  actionLabel="Reload menu"
                  onAction={() => setMenuReloadKey((key) => key + 1)}
                />
              )}

              {!menuLoading && !menuError && totalMenuItems === 0 && (
                <StateCard
                  title="No menu items available"
                  message="The menu for this branch is empty right now. Please ask a member of staff for help."
                />
              )}

              {!menuLoading && !menuError && totalMenuItems > 0 && sections.length === 0 && (
                <StateCard
                  title="No dishes match your search"
                  message="Try a different word, or clear the search to see the full menu."
                  actionLabel="Clear search"
                  onAction={() => setSearch('')}
                />
              )}

              {!menuLoading &&
                !menuError &&
                sections.map((section) => (
                  <section className="qo-section" key={`${section.id}-${categoryId}`}>
                    <h2 className="qo-display qo-section-title">
                      {section.title}
                      <span className="qo-section-count">{section.items.length}</span>
                    </h2>

                    <div className="qo-list">
                      {section.items.map((item) => (
                        <MenuRow
                          key={item.id}
                          item={item}
                          quantity={cart[item.id] || 0}
                          onAdd={addToCart}
                          onSub={subFromCart}
                        />
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Floating cart */}
      {menuReady && cartCount > 0 && !cartOpen && (
        <div className="qo-fab-wrap">
          <button
            type="button"
            className="qo-fab"
            onClick={() => {
              setOrderError('');
              setCartOpen(true);
            }}
            aria-label={`View your order, ${cartCount} items, ${money(cartSubtotal)}`}
          >
            <span className="qo-fab-badge" key={cartCount}>
              {cartCount}
            </span>
            <span className="qo-fab-mid">View your order</span>
            <span className="qo-fab-total">{money(cartSubtotal)}</span>
          </button>
        </div>
      )}

      {/* Cart bottom sheet */}
      {cartOpen && cartCount > 0 && (
        <>
          <div className="qo-overlay" onClick={() => setCartOpen(false)} />
          <div className="qo-sheet" role="dialog" aria-modal="true" aria-label="Your order">
            <div className="qo-sheet-grab" aria-hidden="true" />
            <div className="qo-sheet-head">
              <div>
                <h2 className="qo-display" style={{ fontSize: 24, margin: 0 }}>
                  Your order
                </h2>
                <p className="qo-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                  {tableNumber !== undefined ? `Table ${tableNumber}, ` : ''}
                  {cartCount} {cartCount === 1 ? 'item' : 'items'}
                </p>
              </div>
              <button
                type="button"
                className="qo-icon-btn"
                onClick={() => setCartOpen(false)}
                aria-label="Close your order"
              >
                <IconClose />
              </button>
            </div>

            <div className="qo-sheet-body">
              <div className="qo-cart-lines">
                {cartLines.map((line) => (
                  <div className="qo-line" key={line.item.id}>
                    <div className="qo-line-thumb">
                      <FoodImage
                        src={resolveAssetUrl(primaryImageUrl(line.item))}
                        alt={line.item.name}
                      />
                    </div>

                    <div className="qo-line-main">
                      <div className="qo-line-name">{line.item.name}</div>
                      <div className="qo-muted" style={{ fontSize: 13 }}>
                        {money(line.item.price)} each
                      </div>
                      <div className="qo-stepper is-small">
                        <button
                          type="button"
                          onClick={() => subFromCart(line.item.id)}
                          aria-label={`Remove one ${line.item.name}`}
                        >
                          <IconMinus size={16} />
                        </button>
                        <span className="qo-qty" key={line.quantity}>
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => addToCart(line.item.id)}
                          aria-label={`Add one more ${line.item.name}`}
                        >
                          <IconPlus size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="qo-line-total">
                      {money(toNumber(line.item.price) * line.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <label className="qo-note">
                <span className="qo-note-label">Your name (required)</span>
                <input className="qo-input" required minLength={2} maxLength={120} autoComplete="name" placeholder="Enter your full name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </label>

              <label className="qo-note">
                <span className="qo-note-label">Phone number (required)</span>
                <input className="qo-input" required inputMode="tel" autoComplete="tel" maxLength={20} placeholder="Enter your phone number" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              </label>

              <label className="qo-note">
                <span className="qo-note-label">Note for the kitchen (optional)</span>
                <textarea
                  className="qo-input"
                  rows={2}
                  placeholder="Allergies, spice level, anything we should know"
                  value={specialInstructions}
                  onChange={(event) => setSpecialInstructions(event.target.value)}
                />
              </label>

              <div className="qo-sums">
                <div className="qo-sum-row">
                  <span>Batch subtotal</span>
                  <span>{money(cartSubtotal)}</span>
                </div>
                <div className="qo-sum-row">
                  <span>Discount</span>
                  <span className="qo-muted">Applied only to final bill</span>
                </div>
                <div className="qo-sum-row">
                  <span>Tax</span>
                  <span className="qo-muted">Calculated by the restaurant</span>
                </div>
                <div className="qo-sum-row is-total">
                  <span>Batch total</span>
                  <span>{money(cartSubtotal)}</span>
                </div>
              </div>

              {orderError && (
                <div className="qo-alert" role="alert" style={{ marginTop: 14 }}>
                  <IconAlert size={20} />
                  <span>{orderError}</span>
                </div>
              )}
            </div>

            <div className="qo-sheet-foot">
              <button
                type="button"
                className="qo-primary"
                onClick={placeOrder}
                disabled={placing}
              >
                {placing ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, margin: '0 auto' }}>
                    <span className="qo-spinner" aria-hidden="true" /> Sending to kitchen
                  </span>
                ) : (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <IconBag /> Complete Order
                    </span>
                    <span>{money(cartSubtotal)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (scoped with the qo- prefix; independent of Tailwind config)  */
/* ------------------------------------------------------------------ */

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');

.qo-root{
  --bg:#F4F6F1;--surface:#FFFFFF;--ink:#16231C;--muted:#5F7067;--line:#DCE3DA;
  --leaf:#1F4A38;--leaf-deep:#163629;--leaf-soft:#E3EEE6;
  --turmeric:#F3B62C;--turmeric-soft:#FFF4D6;
  --chili:#C0392B;--chili-soft:#FBE9E6;
  min-height:100vh;background:var(--bg);color:var(--ink);
  font-family:'Figtree',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
}
.qo-root *,.qo-root *::before,.qo-root *::after{box-sizing:border-box}
.qo-root button,.qo-root input,.qo-root textarea{font:inherit;color:inherit}
.qo-root button{cursor:pointer}
.qo-root button:disabled{cursor:not-allowed}
.qo-root :focus-visible{outline:3px solid var(--turmeric);outline-offset:2px}
.qo-root h1,.qo-root h2,.qo-root h3,.qo-root p,.qo-root ol,.qo-root ul{margin:0;padding:0}
.qo-root ol,.qo-root ul{list-style:none}
.qo-display{font-family:'Bricolage Grotesque','Figtree',system-ui,sans-serif;letter-spacing:-0.02em;font-weight:800;line-height:1.1}
.qo-muted{color:var(--muted)}
.qo-wrap{max-width:1000px;margin:0 auto;padding:0 18px}
.qo-stack{display:flex;flex-direction:column;gap:16px}

.qo-history-list{
  display:flex;
  flex-direction:column;
  gap:12px;
  margin-top:14px;
}
.qo-history-card{
  border:1px solid var(--line);
  background:var(--surface);
  border-radius:16px;
  padding:14px;
}
.qo-history-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:10px;
}
.qo-history-status{
  display:inline-flex;
  align-items:center;
  min-height:28px;
  padding:0 10px;
  border-radius:999px;
  background:var(--leaf-soft);
  color:var(--leaf);
  font-size:12px;
  font-weight:800;
  text-transform:uppercase;
}
.qo-history-card .qo-order-items{margin-top:0}
.qo-history-card .qo-sum-row{
  margin-top:10px;
  padding-top:10px;
  border-top:1px solid var(--line);
}

/* Hero */
.qo-hero{background:var(--leaf);color:#F4F6F1;padding:26px 0 56px}
.qo-hero.is-compact{padding:20px 0 48px}
.qo-hero-inner{display:flex;align-items:center;justify-content:space-between;gap:16px}
.qo-brand{display:flex;align-items:center;gap:14px;min-width:0}
.qo-brand-name{font-size:26px}
.qo-brand-sub{margin-top:4px;font-size:13px;color:rgba(244,246,241,.72);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.qo-mark{flex:none;border-radius:50%;background:#F4F6F1;overflow:hidden;display:grid;place-items:center;
  color:var(--leaf);box-shadow:0 0 0 3px var(--turmeric)}
.qo-mark img{width:100%;height:100%;object-fit:contain;padding:5px}
.qo-seat{flex:none;background:var(--turmeric);color:var(--leaf-deep);border-radius:22px 22px 22px 6px;
  padding:10px 16px 9px;text-align:center;min-width:80px;display:flex;flex-direction:column;align-items:center}
.qo-seat-label{font-size:12px;font-weight:600;line-height:1}
.qo-seat-num{font-size:42px;margin-top:3px}
.qo-seat-note{font-size:11px;font-weight:600;line-height:1;margin-top:4px}
.qo-body{background:var(--bg);border-radius:26px 26px 0 0;margin-top:-24px;min-height:60vh}

/* Loading screen */
.qo-loading{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.qo-loading-mark{animation:qo-breathe 2s ease-in-out infinite}
.qo-dots{display:flex;gap:7px;margin-top:22px}
.qo-dots span{width:9px;height:9px;border-radius:50%;background:var(--leaf);animation:qo-bounce 1s ease-in-out infinite}
.qo-dots span:nth-child(2){animation-delay:.15s}
.qo-dots span:nth-child(3){animation-delay:.3s}

/* Sticky search + categories */
.qo-bar{position:sticky;top:0;z-index:20;background:var(--bg);padding-top:18px;border-radius:26px 26px 0 0;box-shadow:0 1px 0 var(--line)}
.qo-search{position:relative}
.qo-search > svg{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.qo-search input{width:100%;height:50px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);
  padding:0 48px 0 46px;font-size:16px;-webkit-appearance:none;appearance:none}
.qo-search input:focus{border-color:var(--leaf);outline:none;box-shadow:0 0 0 3px var(--leaf-soft)}
.qo-search-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;
  background:transparent;border-radius:12px;display:grid;place-items:center;color:var(--muted)}
.qo-cats{display:flex;gap:8px;overflow-x:auto;padding:12px 18px 14px;margin:0 -18px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.qo-cats::-webkit-scrollbar{display:none}
.qo-pill{flex:none;height:42px;padding:0 18px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);
  font-weight:600;font-size:15px;white-space:nowrap;transition:background .2s,color .2s,border-color .2s}
.qo-pill.is-active{background:var(--leaf);border-color:var(--leaf);color:#fff}

/* Menu list */
.qo-pad{padding-bottom:48px}
.qo-pad-cart{padding-bottom:130px}
.qo-section{padding-top:24px;animation:qo-swap .3s ease both}
.qo-section-title{display:flex;align-items:baseline;gap:10px;font-size:26px}
.qo-section-count{font-family:'Figtree',system-ui,sans-serif;font-size:14px;font-weight:600;color:var(--muted);letter-spacing:0}
.qo-list{display:grid;grid-template-columns:1fr;column-gap:44px}
@media(min-width:780px){.qo-list{grid-template-columns:1fr 1fr}}
.qo-row{display:grid;grid-template-columns:1fr 116px;gap:16px;padding:18px 0 32px;border-bottom:1px solid var(--line)}
@media(min-width:780px){.qo-row{grid-template-columns:1fr 132px}}
.qo-row-text{min-width:0}
.qo-row-name{font-size:18px;font-weight:700;line-height:1.25}
.qo-row-desc{margin-top:6px;font-size:14px;color:var(--muted);line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.qo-price{display:block;margin-top:10px;font-weight:800;font-size:16px;font-variant-numeric:tabular-nums}
.qo-row-media{position:relative;width:116px;height:116px;justify-self:end}
@media(min-width:780px){.qo-row-media{width:132px;height:132px}}
.qo-row-photo{position:absolute;inset:0;border-radius:22px;overflow:hidden;background:var(--leaf-soft)}
.qo-row-action{position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);z-index:2;white-space:nowrap}

.qo-add{height:42px;min-width:92px;padding:0 20px;border-radius:14px;border:1.5px solid var(--leaf);background:var(--surface);
  color:var(--leaf);font-weight:800;font-size:15px;box-shadow:0 6px 14px rgba(22,54,41,.16);
  transition:transform .12s,background .15s,color .15s}
.qo-add:hover{background:var(--leaf);color:#fff}
.qo-add:active{transform:scale(.94)}
.qo-stepper{display:inline-flex;align-items:center;height:42px;border-radius:14px;background:var(--leaf);color:#fff;
  box-shadow:0 6px 14px rgba(22,54,41,.22)}
.qo-stepper button{width:42px;height:42px;border:0;background:transparent;color:#fff;display:grid;place-items:center;border-radius:14px}
.qo-stepper button:active{background:rgba(255,255,255,.14)}
.qo-stepper.is-small{height:38px;margin-top:8px;box-shadow:none;background:var(--leaf)}
.qo-stepper.is-small button{width:38px;height:38px}
.qo-qty{min-width:22px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums;animation:qo-pop .22s ease}

/* Images */
.qo-img-wrap{position:absolute;inset:0;overflow:hidden}
.qo-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.04);
  transition:opacity .45s ease,transform .6s ease}
.qo-img.is-loaded{opacity:1;transform:scale(1)}
.qo-img-fallback{position:absolute;inset:0;display:grid;place-items:center;color:var(--leaf);
  background:repeating-linear-gradient(135deg,var(--leaf-soft) 0 10px,#EAF3EC 10px 20px)}
.qo-skel,.qo-shimmer{background:linear-gradient(100deg,#E6EBE4 30%,#F3F6F1 50%,#E6EBE4 70%);background-size:200% 100%;animation:qo-shimmer 1.4s linear infinite}
.qo-shimmer{position:absolute;inset:0}

/* Floating cart */
.qo-fab-wrap{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:center;pointer-events:none;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px))}
.qo-fab{pointer-events:auto;width:100%;max-width:560px;height:62px;border:0;border-radius:20px;background:var(--leaf-deep);color:#fff;
  display:flex;align-items:center;padding:0 20px 0 12px;box-shadow:0 14px 32px rgba(22,54,41,.4);animation:qo-rise .35s cubic-bezier(.2,.8,.2,1) both}
.qo-fab:active{transform:scale(.985)}
.qo-fab-badge{min-width:38px;height:38px;padding:0 8px;border-radius:12px;background:var(--turmeric);color:var(--leaf-deep);
  display:grid;place-items:center;font-weight:800;font-size:16px;animation:qo-pop .3s ease}
.qo-fab-mid{flex:1;text-align:left;margin-left:14px;font-weight:700;font-size:16px}
.qo-fab-total{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums}

/* Cart sheet */
.qo-overlay{position:fixed;inset:0;background:rgba(15,28,21,.55);z-index:40;animation:qo-fade .2s ease both}
.qo-sheet{position:fixed;left:0;right:0;bottom:0;z-index:50;margin:0 auto;width:100%;max-width:580px;
  max-height:92vh;max-height:92dvh;background:var(--bg);border-radius:28px 28px 0 0;display:flex;flex-direction:column;
  animation:qo-slide .32s cubic-bezier(.2,.8,.2,1) both}
.qo-sheet-grab{width:42px;height:5px;border-radius:3px;background:var(--line);margin:10px auto 0;flex:none}
.qo-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px 12px;flex:none}
.qo-icon-btn{width:44px;height:44px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);display:grid;place-items:center}
.qo-sheet-body{overflow-y:auto;padding:4px 20px 20px;flex:1;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.qo-sheet-foot{flex:none;padding:12px 20px calc(14px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--line)}
.qo-cart-lines{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:0 14px}
.qo-line{display:grid;grid-template-columns:64px 1fr auto;gap:12px;padding:14px 0;border-bottom:1px solid var(--line);align-items:start}
.qo-line:last-child{border-bottom:0}
.qo-line-thumb{position:relative;width:64px;height:64px;border-radius:16px;overflow:hidden;background:var(--leaf-soft)}
.qo-line-name{font-weight:700;line-height:1.25}
.qo-line-total{font-weight:800;font-variant-numeric:tabular-nums;padding-top:2px}

.qo-offer{margin-top:16px;border:1.5px dashed #D9B44A;background:var(--turmeric-soft);border-radius:18px;padding:14px}
.qo-offer-header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.qo-view-coupons{flex:none;min-height:40px;padding:0 13px;border:1.5px solid var(--leaf);border-radius:12px;
  background:var(--surface);color:var(--leaf);font-size:13px;font-weight:800}
.qo-view-coupons:hover:not(:disabled){background:var(--leaf);color:#fff}
.qo-view-coupons:disabled{opacity:.65}
.qo-offer-error{color:var(--chili)}
.qo-discount-value{color:var(--leaf);font-weight:800}
.qo-coupon-overlay{position:fixed;inset:0;z-index:80;background:rgba(13,25,19,.58);display:flex;align-items:flex-end;
  justify-content:center;padding:12px;animation:qo-fade .18s ease both}
.qo-coupon-modal{width:100%;max-width:580px;max-height:88vh;max-height:88dvh;background:var(--bg);
  border-radius:26px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.28);
  animation:qo-slide .25s cubic-bezier(.2,.8,.2,1) both}
.qo-coupon-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 18px 14px;
  background:var(--surface);border-bottom:1px solid var(--line);flex:none}
.qo-coupon-list{overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.qo-coupon-card{width:100%;text-align:left;border:1.5px solid var(--line);border-radius:18px;background:var(--surface);
  padding:14px;transition:border-color .15s,transform .12s,box-shadow .15s}
.qo-coupon-card:hover:not(.is-disabled){border-color:var(--leaf);box-shadow:0 8px 20px rgba(22,54,41,.10)}
.qo-coupon-card:active:not(.is-disabled){transform:scale(.99)}
.qo-coupon-card.is-disabled{opacity:.62}
.qo-coupon-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.qo-coupon-code{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border-radius:9px;
  background:var(--leaf-soft);color:var(--leaf);font-weight:900;letter-spacing:.04em}
.qo-coupon-value{font-weight:900;color:var(--leaf-deep);white-space:nowrap}
.qo-coupon-description{margin-top:9px;color:var(--muted);font-size:14px}
.qo-coupon-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px;color:var(--muted);font-size:12px}
.qo-coupon-card-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;
  padding-top:10px;border-top:1px dashed var(--line);font-size:13px;font-weight:700}
.qo-coupon-select{color:var(--leaf)}
.qo-coupon-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:44px 18px;
  color:var(--muted)}
.qo-coupon-empty svg{color:var(--leaf)}

.qo-offer-title{display:flex;align-items:center;gap:8px;font-weight:700;color:#6b4d05}
.qo-offer-row{display:flex;gap:8px;margin-top:10px}
.qo-input{width:100%;border:1.5px solid var(--line);background:var(--surface);border-radius:14px;padding:12px 14px;font-size:16px;-webkit-appearance:none;appearance:none}
.qo-input:focus{border-color:var(--leaf);outline:none;box-shadow:0 0 0 3px var(--leaf-soft)}
textarea.qo-input{resize:none;display:block}
.qo-offer-row .qo-input{height:48px;padding:0 14px}
.qo-apply{
  flex:none;
  height:48px;
  min-width:88px;
  padding:0 20px;
  border-radius:14px;
  border:0;
  background:var(--leaf);
  color:#fff !important;
  font-weight:800;
  font-size:15px;
  cursor:pointer;
  transition:opacity .2s,transform .12s,background .2s;
}

.qo-apply:hover:not(:disabled){
  background:var(--leaf-deep);
}

.qo-apply:active:not(:disabled){
  transform:scale(.97);
}

.qo-apply:disabled{
  opacity:.75;
  cursor:not-allowed;
}
.qo-apply:disabled{opacity:.75;cursor:not-allowed}
.qo-coupon-applied{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;background:var(--surface);
  border-radius:14px;padding:10px 14px}
.qo-link-btn{border:0;background:transparent;color:var(--chili);font-weight:700;padding:8px 4px;min-height:40px}
.qo-offer-note{margin-top:8px;font-size:13px;color:#6b4d05}
.qo-note{display:block;margin-top:16px}
.qo-note-label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}

/* Totals */
.qo-sums{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.qo-sum-row{display:flex;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}
.qo-sum-row.is-discount{color:var(--leaf)}
.qo-sum-row.is-total{border-top:1px solid var(--line);padding-top:12px;margin-top:4px;font-size:19px;font-weight:800}

/* Buttons & alerts */
.qo-primary{width:100%;min-height:56px;border:0;border-radius:18px;background:var(--leaf);color:#fff;font-weight:800;font-size:17px;
  display:flex;align-items:center;justify-content:space-between;padding:0 22px;transition:transform .12s,opacity .2s}
.qo-final-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qo-final-actions .qo-outline-btn,.qo-final-actions .qo-primary{width:100%}
@media(max-width:520px){.qo-final-actions{grid-template-columns:1fr}}
.qo-primary:active{transform:scale(.985)}
.qo-primary:disabled{opacity:.8}
.qo-outline-btn{min-height:50px;padding:0 22px;border-radius:16px;border:1.5px solid var(--leaf);background:transparent;color:var(--leaf);font-weight:700;font-size:16px}
.qo-spinner{width:20px;height:20px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:qo-spin .8s linear infinite}
.qo-alert{display:flex;gap:10px;align-items:flex-start;background:var(--chili-soft);color:#7d2218;border-radius:14px;padding:12px 14px;font-size:14px}
.qo-alert > svg{flex:none;margin-top:1px}
.qo-alert.is-info{background:var(--turmeric-soft);color:#6b4d05}

/* State cards */
.qo-state{text-align:center;padding:52px 12px;display:flex;flex-direction:column;align-items:center;gap:8px}
.qo-state-icon{width:64px;height:64px;border-radius:20px;background:var(--leaf-soft);color:var(--leaf);display:grid;place-items:center;margin-bottom:6px}
.qo-state-title{font-size:22px}
.qo-state .qo-muted{max-width:34ch}
.qo-state .qo-outline-btn{margin-top:12px}

/* Manual selection */
.qo-choice{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);
  border-radius:20px;padding:14px}
.qo-choice-title{display:block;font-weight:700;font-size:17px}
.qo-choice-sub{display:block;font-size:14px}
.qo-table-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(min-width:640px){.qo-table-grid{grid-template-columns:repeat(5,1fr)}}
.qo-table-btn{min-height:76px;border-radius:18px;border:1.5px solid var(--line);background:var(--surface);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:4px}
.qo-table-btn:not(:disabled):active{border-color:var(--leaf);background:var(--leaf-soft)}
.qo-table-btn:disabled{opacity:.4}

/* Tracking */
.qo-body > .qo-wrap.qo-stack{padding-top:22px;padding-bottom:40px}
.qo-status{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:22px}
.qo-status-title{font-size:34px;margin-top:6px;animation:qo-swap .4s ease both}
.qo-segs{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:20px}
.qo-seg{height:8px;border-radius:4px;background:var(--line);transition:background .6s ease}
.qo-seg.is-done{background:var(--leaf)}
.qo-seg.is-current{background:var(--turmeric);animation:qo-blink 1.6s ease-in-out infinite}
.qo-panel{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:20px}
.qo-panel-title{font-size:20px;margin-bottom:12px}
.qo-steps{display:flex;flex-direction:column}
.qo-step{display:flex;gap:14px;position:relative;padding-bottom:20px;min-height:32px}
.qo-step:last-child{padding-bottom:0}
.qo-step::before{content:'';position:absolute;left:13px;top:28px;bottom:-2px;width:2px;background:var(--line)}
.qo-step:last-child::before{display:none}
.qo-step.is-done::before{background:var(--leaf)}
.qo-dot{flex:none;width:28px;height:28px;border-radius:50%;border:2px solid var(--line);background:var(--surface);color:#fff;
  display:grid;place-items:center;position:relative;z-index:1;transition:background .4s,border-color .4s}
.qo-step.is-done .qo-dot{background:var(--leaf);border-color:var(--leaf)}
.qo-step.is-current .qo-dot{background:var(--turmeric);border-color:var(--turmeric);animation:qo-pulse 2s ease-out infinite}
.qo-step-label{font-weight:600;color:var(--muted);line-height:28px}
.qo-step.is-done .qo-step-label{color:var(--ink)}
.qo-step.is-current .qo-step-label{color:var(--ink);font-weight:800}
.qo-step-hint{font-size:14px;color:var(--muted);margin-top:-2px}
.qo-order-items li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.qo-order-items li:last-child{border-bottom:0}
.qo-done-badge{display:inline-flex;align-items:center;gap:8px;background:var(--leaf-soft);color:var(--leaf);font-weight:800;padding:8px 14px;border-radius:12px}

/* Bill */
.qo-bill{background:var(--surface);border:1px solid var(--line);border-radius:10px 10px 26px 26px;padding:26px 22px 22px;box-shadow:0 10px 30px rgba(22,54,41,.08)}
.qo-bill-head{text-align:center;padding-bottom:18px;border-bottom:2px dashed var(--line)}
.qo-bill-lines{padding:16px 0;display:flex;flex-direction:column;gap:10px}
.qo-bill-line{display:flex;justify-content:space-between;gap:12px;font-size:15px;font-variant-numeric:tabular-nums}
.qo-bill-sums{border-top:2px dashed var(--line);padding-top:14px;display:flex;flex-direction:column;gap:8px}
.qo-pay{margin:18px 0;background:var(--turmeric-soft);border-radius:14px;padding:12px;text-align:center;font-size:14px}
.qo-pay.is-paid{background:var(--leaf-soft);color:var(--leaf)}
.qo-bill .qo-primary{justify-content:center}

/* Motion */
@keyframes qo-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes qo-pop{0%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes qo-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes qo-slide{from{transform:translateY(100%)}to{transform:none}}
@keyframes qo-fade{from{opacity:0}to{opacity:1}}
@keyframes qo-swap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes qo-spin{to{transform:rotate(360deg)}}
@keyframes qo-bounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-8px);opacity:1}}
@keyframes qo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes qo-blink{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes qo-pulse{0%{box-shadow:0 0 0 0 rgba(243,182,44,.55)}70%{box-shadow:0 0 0 10px rgba(243,182,44,0)}100%{box-shadow:0 0 0 0 rgba(243,182,44,0)}}
@media (prefers-reduced-motion: reduce){
  .qo-root *,.qo-root *::before,.qo-root *::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
}

/* Print: only the bill is printed */
@media print {
  body * { visibility: hidden; }
  #customer-bill, #customer-bill * { visibility: visible; }
  #customer-bill { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: 0; }
  .qo-noprint { display: none !important; }
}
`;

