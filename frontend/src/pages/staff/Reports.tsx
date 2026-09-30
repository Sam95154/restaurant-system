import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';

type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';

interface Branch { id: string; name: string; status?: string; }
interface SalesBill { id: string; billNumber?: number | string; subtotal?: number | string; discount?: number | string; tax?: number | string; total?: number | string; paymentStatus?: string; createdAt: string; }
interface SalesSummary { grossSales: number; totalDiscounts: number; totalTax: number; netSales: number; totalOrders: number; averageOrderValue: number; }
interface DashboardReport { branches?: number; employees?: number; customers?: number; tables?: number; items?: number; ordersToday?: number; ordersByStatus?: Record<string, number>; paidBillsToday?: number; salesToday?: number; }
interface ReportData { [key: string]: any; }

function formatDate(date: Date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function getDateRange(preset: DatePreset) {
  const today = new Date();
  if (preset === 'TODAY') { const d = formatDate(today); return { from: d, to: d }; }
  if (preset === 'YESTERDAY') { const d = new Date(today); d.setDate(d.getDate() - 1); const s = formatDate(d); return { from: s, to: s }; }
  if (preset === 'THIS_WEEK') { const start = new Date(today); const day = start.getDay(); start.setDate(start.getDate() - (day === 0 ? 6 : day - 1)); return { from: formatDate(start), to: formatDate(today) }; }
  if (preset === 'THIS_MONTH') return { from: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: formatDate(today) };
  return { from: formatDate(today), to: formatDate(today) };
}
function money(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'; }
function number(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n.toLocaleString('en-IN') : '0'; }
function pct(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? `${n.toFixed(2)}%` : '0.00%'; }
function rows(value: any): any[] { return Array.isArray(value) ? value : []; }
function dataOf(response: any): any { return response?.data ?? {}; }
function queryString(params: URLSearchParams) { const s = params.toString(); return s ? `?${s}` : ''; }

function ReportSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="mt-6 rounded-2xl border border-coffee/10 bg-white shadow-sm print:shadow-none">
    <div className="border-b border-coffee/10 px-5 py-4"><h2 className="text-xl font-bold text-coffee-dark">{title}</h2><p className="mt-1 text-sm text-coffee/60">{description}</p></div>
    <div className="p-5">{children}</div>
  </section>;
}
function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="rounded-xl border border-coffee/10 p-4"><p className="text-sm text-coffee/60">{label}</p><p className="mt-2 text-2xl font-bold text-coffee-dark">{value}</p>{sub && <p className="mt-1 text-xs text-coffee/50">{sub}</p>}</div>;
}
function Loading({ text = 'Loading report...' }) { return <div className="rounded-xl bg-coffee/5 p-6 text-center text-sm text-coffee/60">{text}</div>; }
function ErrorBox({ text }: { text: string }) { return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{text}</div>; }
function Empty({ text = 'No data available for this period.' }) { return <div className="rounded-xl border border-dashed border-coffee/20 bg-coffee/5 p-6 text-center text-sm text-coffee/60">{text}</div>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-coffee/10"><table className="min-w-full text-left text-sm"><thead className="bg-coffee/5"><tr>{headers.map(h => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-coffee/10">{children}</tbody></table></div>;
}

export default function Reports() {
  const initial = getDateRange('TODAY');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [sales, setSales] = useState<any>({});
  const [items, setItems] = useState<any>({});
  const [orders, setOrders] = useState<any>({});
  const [payments, setPayments] = useState<any>({});
  const [tax, setTax] = useState<any>({});
  const [discounts, setDiscounts] = useState<any>({});
  const [branchReport, setBranchReport] = useState<any>({});
  const [employees, setEmployees] = useState<any>({});
  const [inventory, setInventory] = useState<any>({});
  const [expenses, setExpenses] = useState<any>({});
  const [purchases, setPurchases] = useState<any>({});
  const [financial, setFinancial] = useState<any>({});
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams({ from: fromDate, to: toDate });
    if (branchId) p.set('branchId', branchId);
    return p;
  }, [fromDate, toDate, branchId]);
  const qs = queryString(params);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [b, d, s, i, o, p, t, dc, br, e, inv, ex, pu, f] = await Promise.all([
        api.get('/branches'),
        api.get('/reports/dashboard'),
        api.get(`/reports/sales${qs}`),
        api.get(`/reports/items${qs}`),
        api.get(`/reports/orders${qs}`),
        api.get(`/reports/payments${qs}`),
        api.get(`/reports/tax${qs}`),
        api.get(`/reports/discounts${qs}`),
        api.get(`/reports/branches${qs}`),
        api.get(`/reports/employees${qs}`),
        api.get(`/reports/inventory${qs}`),
        api.get(`/reports/expenses${qs}`),
        api.get(`/reports/purchases${qs}`),
        api.get(`/reports/financial${qs}`),
      ]);
      const bd = dataOf(b); setBranches(rows(bd.branches ?? bd));
      setDashboard(dataOf(d)); setSales(dataOf(s)); setItems(dataOf(i)); setOrders(dataOf(o)); setPayments(dataOf(p)); setTax(dataOf(t)); setDiscounts(dataOf(dc)); setBranchReport(dataOf(br)); setEmployees(dataOf(e)); setInventory(dataOf(inv)); setExpenses(dataOf(ex)); setPurchases(dataOf(pu)); setFinancial(dataOf(f));
    } catch (e) {
      console.error('Failed to load reports:', e); setError('One or more reports could not be loaded. Please refresh and check the backend.');
    } finally { setLoading(false); }
  }, [qs, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { async function loadBranches() { try { const r = await api.get('/branches'); const d = dataOf(r); setBranches(rows(d.branches ?? d)); } catch (e) { console.error(e); } } void loadBranches(); }, []);

  function presetChange(preset: DatePreset) { setDatePreset(preset); if (preset !== 'CUSTOM') { const r = getDateRange(preset); setFromDate(r.from); setToDate(r.to); } }
  function print() {
    document.body.classList.add('reports-print-mode');
    const cleanup = () => {
      document.body.classList.remove('reports-print-mode');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1500);
  }

  function downloadCsv(filename: string, data: any[]) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(','), ...data.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function exportSection(name: string, data: any[]) { downloadCsv(`${name}-report-${fromDate}-to-${toDate}.csv`, data); }

  const salesSummary: SalesSummary = sales.summary ?? { grossSales: 0, totalDiscounts: 0, totalTax: 0, netSales: 0, totalOrders: 0, averageOrderValue: 0 };
  const salesBills: SalesBill[] = rows(sales.bills);
  const itemRows = rows(items.items ?? items);
  const sortedItems = useMemo(() => [...itemRows].sort((a,b) => Number(b.revenue ?? b.totalRevenue ?? 0) - Number(a.revenue ?? a.totalRevenue ?? 0)), [itemRows]);
  const orderRows = rows(orders.orders);
  const paymentRows = rows(payments.payments);
  const taxRows = rows(tax.bills);
  const discountRows = rows(discounts.bills);
  const branchRows = rows(branchReport.branches);
  const employeeRows = rows(employees.employees);
  const inventoryRows = rows(inventory.items);
  const lowStockRows = rows(inventory.lowStock);
  const expenseRows = rows(expenses.expenses);
  const purchaseRows = rows(purchases.purchases);
  const financialSummary = financial.summary ?? {};

  return <>
    <style>{`
      @media print {
        body.reports-print-mode * {
          visibility: hidden !important;
        }

        body.reports-print-mode #reports-print-area,
        body.reports-print-mode #reports-print-area * {
          visibility: visible !important;
        }

        body.reports-print-mode #reports-print-area {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
        }

        body.reports-print-mode #reports-print-area .print\\:hidden {
          display: none !important;
        }

        @page {
          margin: 10mm;
        }
      }
    `}</style>

    <div id="reports-print-area" className="p-6 print:p-0">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between print:mb-4">
      <div><h1 className="text-2xl font-bold text-coffee-dark">Reports</h1><p className="mt-1 text-sm text-coffee/60">Restaurant reports and analytics</p></div>
      <div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={() => setRefreshKey(k => k + 1)} className="rounded-xl bg-turmeric px-4 py-2.5 text-sm font-semibold text-coffee-dark">Refresh</button><button type="button" onClick={print} className="rounded-xl border border-coffee/20 bg-white px-4 py-2.5 text-sm font-semibold text-coffee-dark">Print / PDF</button></div>
    </div>

    <div className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm print:hidden">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div><label className="mb-1 block text-sm font-semibold text-coffee-dark">Date Range</label><select value={datePreset} onChange={e => presetChange(e.target.value as DatePreset)} className="w-full rounded-xl border border-coffee/20 bg-white px-3 py-2.5 text-sm"><option value="TODAY">Today</option><option value="YESTERDAY">Yesterday</option><option value="THIS_WEEK">This week</option><option value="THIS_MONTH">This month</option><option value="CUSTOM">Custom range</option></select></div>
        <div><label className="mb-1 block text-sm font-semibold text-coffee-dark">Branch</label><select value={branchId} onChange={e => setBranchId(e.target.value)} className="w-full rounded-xl border border-coffee/20 bg-white px-3 py-2.5 text-sm"><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="mb-1 block text-sm font-semibold text-coffee-dark">From</label><input type="date" value={fromDate} disabled={datePreset !== 'CUSTOM'} onChange={e => setFromDate(e.target.value)} className="w-full rounded-xl border border-coffee/20 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100" /></div>
        <div><label className="mb-1 block text-sm font-semibold text-coffee-dark">To</label><input type="date" value={toDate} disabled={datePreset !== 'CUSTOM'} onChange={e => setToDate(e.target.value)} className="w-full rounded-xl border border-coffee/20 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100" /></div>
        <div className="flex items-end"><div className="w-full rounded-xl bg-coffee/5 px-4 py-2.5 text-sm text-coffee/70"><b className="text-coffee-dark">Period:</b> {fromDate} → {toDate}</div></div>
      </div>
    </div>

    {error && <div className="mt-6"><ErrorBox text={error} /></div>}
    {loading && <div className="mt-6"><Loading text="Loading all report sections..." /></div>}

    <ReportSection title="1. Sales Report" description="Gross sales, discounts, tax, net sales, number of orders and average order value.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('sales', salesBills)} disabled={!salesBills.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Card label="Gross Sales" value={money(salesSummary.grossSales)} /><Card label="Discounts" value={money(salesSummary.totalDiscounts)} /><Card label="Tax" value={money(salesSummary.totalTax)} /><Card label="Net Sales" value={money(salesSummary.netSales)} /><Card label="Number of Orders" value={number(salesSummary.totalOrders)} /><Card label="Average Order Value" value={money(salesSummary.averageOrderValue)} /></div>
      {salesBills.length ? <div className="mt-6"><Table headers={['Bill #','Date','Subtotal','Discount','Tax','Total','Status']}>{salesBills.map(b => <tr key={b.id}><td className="px-4 py-3">#{b.billNumber ?? '-'}</td><td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td><td className="px-4 py-3">{money(b.subtotal)}</td><td className="px-4 py-3">{money(b.discount)}</td><td className="px-4 py-3">{money(b.tax)}</td><td className="px-4 py-3 font-semibold">{money(b.total)}</td><td className="px-4 py-3">{b.paymentStatus ?? '-'}</td></tr>)}</Table></div> : <div className="mt-6"><Empty text="No paid bills found." /></div>}
    </ReportSection>

    <ReportSection title="2. Order Report" description="Total, completed, cancelled, pending and preparing orders by type, date and branch.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('orders', orderRows)} disabled={!orderRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Card label="Total Orders" value={number(orders.summary?.totalOrders)} /><Card label="Completed" value={number(orders.summary?.completedOrders)} /><Card label="Cancelled" value={number(orders.summary?.cancelledOrders)} /><Card label="Pending" value={number(orders.summary?.pendingOrders)} /></div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3"><div><h3 className="mb-3 font-semibold">By Type</h3><Table headers={['Type','Orders','Revenue']}>{rows(orders.byType).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.type}</td><td className="px-4 py-3">{number(r.orders)}</td><td className="px-4 py-3">{money(r.revenue)}</td></tr>)}</Table></div><div><h3 className="mb-3 font-semibold">By Date</h3><Table headers={['Date','Orders','Revenue']}>{rows(orders.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{number(r.orders)}</td><td className="px-4 py-3">{money(r.revenue)}</td></tr>)}</Table></div><div><h3 className="mb-3 font-semibold">By Branch</h3><Table headers={['Branch','Orders','Revenue']}>{rows(orders.byBranch).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.branchName ?? r.name}</td><td className="px-4 py-3">{number(r.orders)}</td><td className="px-4 py-3">{money(r.revenue)}</td></tr>)}</Table></div></div>
      {orderRows.length > 0 && <div className="mt-6"><Table headers={['Order','Type','Status','Subtotal','Discount','Tax','Total','Branch','Date']}>{orderRows.map((r,i)=><tr key={r.id ?? i}><td className="px-4 py-3">{r.orderNumber ?? r.id ?? '-'}</td><td className="px-4 py-3">{r.type ?? '-'}</td><td className="px-4 py-3">{r.status ?? '-'}</td><td className="px-4 py-3">{money(r.subtotal)}</td><td className="px-4 py-3">{money(r.discountAmount)}</td><td className="px-4 py-3">{money(r.taxAmount)}</td><td className="px-4 py-3 font-semibold">{money(r.total)}</td><td className="px-4 py-3">{r.branch?.name ?? r.branchName ?? '-'}</td><td className="px-4 py-3">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td></tr>)}</Table></div>}
    </ReportSection>

    <ReportSection title="3. Item / Menu Report" description="Best-selling, lowest-selling, quantity sold, revenue and item performance.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('items', itemRows)} disabled={!itemRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      {!itemRows.length ? <Empty /> : <><div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><div className="rounded-xl border border-coffee/10 p-4"><h3 className="font-semibold">Best-selling Items</h3>{sortedItems.slice(0,5).map((r,i)=><div key={r.itemId ?? r.id ?? i} className="flex justify-between border-b border-coffee/10 py-2"><span>{i+1}. {r.name ?? r.nameSnapshot ?? 'Unknown'}</span><span className="font-semibold">{number(r.quantity ?? r.totalQuantity)} · {money(r.revenue ?? r.totalRevenue)}</span></div>)}</div><div className="rounded-xl border border-coffee/10 p-4"><h3 className="font-semibold">Lowest-selling Items</h3>{[...sortedItems].reverse().slice(0,5).map((r,i)=><div key={r.itemId ?? r.id ?? i} className="flex justify-between border-b border-coffee/10 py-2"><span>{i+1}. {r.name ?? r.nameSnapshot ?? 'Unknown'}</span><span className="font-semibold">{number(r.quantity ?? r.totalQuantity)} · {money(r.revenue ?? r.totalRevenue)}</span></div>)}</div></div><div className="mt-6"><Table headers={['Item','Quantity Sold','Revenue']}>{itemRows.map((r,i)=><tr key={r.itemId ?? r.id ?? i}><td className="px-4 py-3">{r.name ?? r.nameSnapshot ?? 'Unknown'}</td><td className="px-4 py-3">{number(r.quantity ?? r.totalQuantity)}</td><td className="px-4 py-3">{money(r.revenue ?? r.totalRevenue)}</td></tr>)}</Table></div></>}
    </ReportSection>

    <ReportSection title="4. Payment Report" description="Cash, card, UPI and other payments, paid/unpaid bills and total collected.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('payments', paymentRows)} disabled={!paymentRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Card label="Total Collected" value={money(payments.summary?.totalCollected)} /><Card label="Paid Bills" value={number(payments.summary?.paidBills)} /><Card label="Unpaid Bills" value={number(payments.summary?.unpaidBills)} /><Card label="Payments" value={number(payments.summary?.totalPayments)} /></div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2"><div><h3 className="mb-3 font-semibold">By Payment Method</h3><Table headers={['Method','Payments','Amount']}>{rows(payments.byMethod).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.method}</td><td className="px-4 py-3">{number(r.payments)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div><div><h3 className="mb-3 font-semibold">By Date</h3><Table headers={['Date','Payments','Amount']}>{rows(payments.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{number(r.payments)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div></div>
    </ReportSection>

    <ReportSection title="5. Tax Report" description="Tax collected, taxable sales, date-wise and branch-supported bill information.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('tax', taxRows)} disabled={!taxRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Card label="Taxable Sales" value={money(tax.summary?.taxableSales)} /><Card label="Tax Collected" value={money(tax.summary?.taxCollected)} /><Card label="Total Sales" value={money(tax.summary?.totalSales)} /><Card label="Bills" value={number(tax.summary?.billCount)} /></div>
      <div className="mt-6"><Table headers={['Date','Taxable Sales','Tax Collected','Total Sales']}>{rows(tax.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{money(r.taxableSales)}</td><td className="px-4 py-3">{money(r.taxCollected)}</td><td className="px-4 py-3">{money(r.totalSales)}</td></tr>)}</Table></div>
    </ReportSection>

    <ReportSection title="6. Discount Report" description="Total discounts, discounted bills, date/branch impact and discounted sales.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('discounts', discountRows)} disabled={!discountRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5"><Card label="Total Discounts" value={money(discounts.summary?.totalDiscounts)} /><Card label="Discounted Bills" value={number(discounts.summary?.discountedBills)} /><Card label="Discounted Sales" value={money(discounts.summary?.discountedSales)} /><Card label="Original Sales" value={money(discounts.summary?.originalSales)} /><Card label="Discount Impact" value={pct(discounts.summary?.discountPercentage)} /></div>
      {rows(discounts.byDate).length ? <div className="mt-6"><Table headers={['Date','Bills','Discount','Sales']}>{rows(discounts.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{number(r.bills ?? r.orders)}</td><td className="px-4 py-3">{money(r.discount ?? r.amount)}</td><td className="px-4 py-3">{money(r.sales ?? r.discountedSales)}</td></tr>)}</Table></div> : <div className="mt-6"><Empty text="No discounted bills found for this period." /></div>}
    </ReportSection>

    <ReportSection title="7. Branch Report" description="Branch-wise sales, orders, revenue, payment totals and item performance.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('branches', branchRows)} disabled={!branchRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3"><Card label="Branches" value={number(branchReport.summary?.branchCount ?? dashboard?.branches)} /><Card label="Total Orders" value={number(branchReport.summary?.totalOrders)} /><Card label="Total Revenue" value={money(branchReport.summary?.totalRevenue)} /></div>
      {branchRows.length ? <div className="space-y-6">{branchRows.map((b,i)=><div key={b.branchId ?? i} className="rounded-xl border border-coffee/10 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-coffee-dark">{b.branchName ?? b.name ?? 'Branch'}</h3><span className="text-xs text-coffee/60">{b.status ?? ''}</span></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6"><Card label="Orders" value={number(b.totalOrders)} /><Card label="Completed" value={number(b.completedOrders)} /><Card label="Cancelled" value={number(b.cancelledOrders)} /><Card label="Revenue" value={money(b.revenue)} /><Card label="Collected" value={money(b.totalCollected)} /><Card label="Payments" value={number(rows(b.paymentTotals).reduce((n,r)=>n+Number(r.payments??0),0))} /></div>{rows(b.paymentTotals).length>0 && <div className="mt-4"><Table headers={['Payment Method','Payments','Amount']}>{b.paymentTotals.map((r:any,j:number)=><tr key={j}><td className="px-4 py-3">{r.method}</td><td className="px-4 py-3">{number(r.payments)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div>}{rows(b.itemPerformance).length>0 && <div className="mt-4"><Table headers={['Item','Quantity','Revenue']}>{b.itemPerformance.map((r:any,j:number)=><tr key={r.itemId??j}><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{number(r.quantity)}</td><td className="px-4 py-3">{money(r.revenue)}</td></tr>)}</Table></div>}</div>)}</div> : <Empty />}
    </ReportSection>

    <ReportSection title="8. Employee Report" description="Orders handled, sales handled, attendance, leave and supported employee activity.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('employees', employeeRows)} disabled={!employeeRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Card label="Employees" value={number(employees.summary?.employeeCount)} /><Card label="Orders Handled" value={number(employees.summary?.totalOrdersHandled)} /><Card label="Sales Handled" value={money(employees.summary?.totalSalesHandled)} /><Card label="Kitchen Orders" value={number(employees.summary?.totalKitchenOrdersHandled)} /></div>
      {employeeRows.length ? <div className="mt-6"><Table headers={['Employee','Role','Service Orders','Sales','Kitchen Orders','Attendance','Leave']}>{employeeRows.map((r,i)=><tr key={r.employeeId??r.id??i}><td className="px-4 py-3 font-semibold">{r.fullName ?? r.name ?? '-'}</td><td className="px-4 py-3">{r.role ?? '-'}</td><td className="px-4 py-3">{number(r.ordersHandled ?? r.serviceOrdersHandled)}</td><td className="px-4 py-3">{money(r.salesHandled)}</td><td className="px-4 py-3">{number(r.kitchenOrdersHandled)}</td><td className="px-4 py-3">{number(r.attendance?.present ?? r.attendanceSummary?.PRESENT ?? r.attendanceRecords)}</td><td className="px-4 py-3">{number(r.leave?.approved ?? r.leaveSummary?.APPROVED ?? r.leaveRecords)}</td></tr>)}</Table></div> : <div className="mt-6"><Empty /></div>}
    </ReportSection>

    <ReportSection title="9. Inventory Report" description="Current stock, low stock, movement, purchases, consumption and wastage where recorded.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('inventory', inventoryRows)} disabled={!inventoryRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Card label="Inventory Items" value={number(inventory.summary?.inventoryItemCount)} /><Card label="Low Stock" value={number(inventory.summary?.lowStockCount)} /><Card label="Current Stock Value" value={money(inventory.summary?.totalCurrentStockValue)} /></div>
      <div className="mt-4 rounded-xl bg-coffee/5 p-4 text-sm"><b>Movement totals:</b> {Object.entries(inventory.summary?.movementTotals ?? {}).map(([k,v]) => `${k}: ${number(v)}`).join(' · ') || 'No recorded movements'}</div>
      {lowStockRows.length > 0 && <div className="mt-6"><h3 className="mb-3 font-semibold">Low-stock Items</h3><Table headers={['Item','SKU','Unit','Current','Reorder Level','Average Cost','Stock Value']}>{lowStockRows.map((r,i)=><tr key={r.inventoryItemId??i}><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.sku}</td><td className="px-4 py-3">{r.unit}</td><td className="px-4 py-3">{number(r.currentQuantity)}</td><td className="px-4 py-3">{number(r.reorderLevel)}</td><td className="px-4 py-3">{money(r.averageCost)}</td><td className="px-4 py-3">{money(r.currentStockValue)}</td></tr>)}</Table></div>}
      {inventoryRows.length > 0 && <div className="mt-6"><Table headers={['Item','SKU','Branch','Quantity','Average Cost','Stock Value','Status']}>{inventoryRows.map((r,i)=><tr key={r.inventoryItemId??i}><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.sku}</td><td className="px-4 py-3">{r.branchId}</td><td className="px-4 py-3">{number(r.currentQuantity)}</td><td className="px-4 py-3">{money(r.averageCost)}</td><td className="px-4 py-3">{money(r.currentStockValue)}</td><td className="px-4 py-3">{r.lowStock ? 'LOW STOCK' : r.status}</td></tr>)}</Table></div>}
    </ReportSection>

    <ReportSection title="10. Expense Report" description="Total expenses, category, payment method, date and branch trends.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('expenses', expenseRows)} disabled={!expenseRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Card label="Total Expenses" value={money(expenses.summary?.totalExpenses)} /><Card label="Expense Count" value={number(expenses.summary?.expenseCount)} /></div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3"><div><h3 className="mb-3 font-semibold">By Category</h3><Table headers={['Category','Count','Amount']}>{rows(expenses.byCategory).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.category}</td><td className="px-4 py-3">{number(r.expenses)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div><div><h3 className="mb-3 font-semibold">By Payment Method</h3><Table headers={['Method','Count','Amount']}>{rows(expenses.byPaymentMethod).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.paymentMethod}</td><td className="px-4 py-3">{number(r.expenses)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div><div><h3 className="mb-3 font-semibold">By Date</h3><Table headers={['Date','Count','Amount']}>{rows(expenses.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{number(r.expenses)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div></div>
      {expenseRows.length > 0 && <div className="mt-6"><Table headers={['Category','Amount','Payment','Date','Description','Status']}>{expenseRows.map((r,i)=><tr key={r.id??i}><td className="px-4 py-3">{r.category}</td><td className="px-4 py-3">{money(r.amount)}</td><td className="px-4 py-3">{r.paymentMethod}</td><td className="px-4 py-3">{r.expenseDate ? new Date(r.expenseDate).toLocaleDateString() : '-'}</td><td className="px-4 py-3">{r.description ?? '-'}</td><td className="px-4 py-3">{r.status}</td></tr>)}</Table></div>}
    </ReportSection>

    <ReportSection title="11. Purchase Report" description="Purchase totals, received purchases, suppliers, dates and inventory purchase lines.">
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => exportSection('purchases', purchaseRows)} disabled={!purchaseRows.length} className="rounded-xl border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Card label="Purchase Count" value={number(purchases.summary?.purchaseCount)} /><Card label="Received Purchases" value={number(purchases.summary?.receivedPurchaseCount)} /><Card label="Total Purchases" value={money(purchases.summary?.totalPurchases)} /></div>
      {rows(purchases.byDate).length > 0 && <div className="mt-6"><Table headers={['Date','Purchases','Amount']}>{rows(purchases.byDate).map((r,i)=><tr key={i}><td className="px-4 py-3">{r.date}</td><td className="px-4 py-3">{number(r.purchases)}</td><td className="px-4 py-3">{money(r.amount)}</td></tr>)}</Table></div>}
      {purchaseRows.length > 0 && <div className="mt-6"><Table headers={['Purchase #','Invoice','Supplier','Date','Status','Subtotal','Tax','Total','Items']}>{purchaseRows.map((r,i)=><tr key={r.id??i}><td className="px-4 py-3">#{r.purchaseNumber}</td><td className="px-4 py-3">{r.invoiceNumber ?? '-'}</td><td className="px-4 py-3">{r.supplier?.name ?? '-'}</td><td className="px-4 py-3">{r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString() : '-'}</td><td className="px-4 py-3">{r.status}</td><td className="px-4 py-3">{money(r.subtotal)}</td><td className="px-4 py-3">{money(r.tax)}</td><td className="px-4 py-3 font-semibold">{money(r.total)}</td><td className="px-4 py-3">{number(rows(r.items).length)}</td></tr>)}</Table></div>}
    </ReportSection>

    <ReportSection title="12. Profit / Financial Summary" description="Uses only recorded sales, expenses, purchases and payroll data; it is not a full accounting profit statement unless all business costs are recorded.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"><Card label="Net Sales" value={money(financialSummary.netSales)} /><Card label="Tax" value={money(financialSummary.totalTax)} /><Card label="Expenses" value={money(financialSummary.totalExpenses)} /><Card label="Purchases" value={money(financialSummary.totalPurchases)} /><Card label="Payroll" value={money(financialSummary.totalPayroll)} /><Card label="Recorded Costs" value={money(financialSummary.recordedCosts)} /><Card label="Net After Recorded Costs" value={money(financialSummary.netAfterRecordedCosts)} /></div>
      {financial.coverage?.note && <div className="mt-4 rounded-xl border border-coffee/10 bg-coffee/5 p-4 text-sm text-coffee/70">{financial.coverage.note}</div>}
    </ReportSection>

    <ReportSection title="13. Report Controls & Exports" description="Use these controls to change the report period, branch, refresh the data, print the complete report, or export report data.">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <div className="rounded-xl border border-coffee/10 p-4">
          <h3 className="font-semibold text-coffee-dark">Date Presets</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ['TODAY', 'Today'],
              ['YESTERDAY', 'Yesterday'],
              ['THIS_WEEK', 'This week'],
              ['THIS_MONTH', 'This month'],
              ['CUSTOM', 'Custom range'],
            ] as Array<[DatePreset, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => presetChange(value)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  datePreset === value
                    ? 'border-turmeric bg-turmeric text-coffee-dark'
                    : 'border-coffee/20 bg-white text-coffee-dark hover:bg-coffee/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-coffee/50">
            Current period: {fromDate} → {toDate}
          </p>
        </div>

        <div className="rounded-xl border border-coffee/10 p-4">
          <h3 className="font-semibold text-coffee-dark">Branch Filter</h3>
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="mt-3 w-full rounded-xl border border-coffee/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-turmeric"
          >
            <option value="">All Branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-coffee/50">
            {branchId ? 'Reports are filtered to the selected branch.' : 'Reports currently include all accessible branches.'}
          </p>
        </div>

        <div className="rounded-xl border border-coffee/10 p-4">
          <h3 className="font-semibold text-coffee-dark">Report Actions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="rounded-lg bg-turmeric px-4 py-2 text-sm font-semibold text-coffee-dark hover:bg-turmeric-deep"
            >
              Refresh Reports
            </button>
            <button
              type="button"
              onClick={print}
              className="rounded-lg border border-coffee/20 bg-white px-4 py-2 text-sm font-semibold text-coffee-dark hover:bg-coffee/5"
            >
              Print / Save PDF
            </button>
          </div>
          <p className="mt-2 text-xs text-coffee/50">
            Printing now includes only the Reports content, not the surrounding application layout.
          </p>
        </div>

        <div className="rounded-xl border border-coffee/10 p-4">
          <h3 className="font-semibold text-coffee-dark">CSV Exports</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ['Sales', 'sales', salesBills],
              ['Orders', 'orders', orderRows],
              ['Items', 'items', itemRows],
              ['Payments', 'payments', paymentRows],
              ['Tax', 'tax', taxRows],
              ['Discounts', 'discounts', discountRows],
              ['Branches', 'branches', branchRows],
              ['Employees', 'employees', employeeRows],
              ['Inventory', 'inventory', inventoryRows],
              ['Low Stock', 'low-stock', lowStockRows],
              ['Expenses', 'expenses', expenseRows],
              ['Purchases', 'purchases', purchaseRows],
            ].map(([label, name, data]) => (
              <button
                key={String(name)}
                type="button"
                onClick={() => exportSection(String(name), data as any[])}
                disabled={!(data as any[]).length}
                className="rounded-lg border border-coffee/20 bg-white px-3 py-2 text-sm font-semibold text-coffee-dark hover:bg-coffee/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-coffee/50">
            Disabled buttons have no row data for the selected period and branch.
          </p>
        </div>

      </div>
    </ReportSection>

    <div className="mt-6 pb-6 text-center text-xs text-coffee/50">Reports generated for {fromDate} → {toDate}{branchId ? ' · Selected branch' : ' · All branches'}</div>
  </div>
  </>;
}
