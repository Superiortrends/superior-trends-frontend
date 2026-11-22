import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Package, X, Mail, Phone, MapPin, CreditCard, Calendar, Truck, User, ShoppingBag, Undo2,
  Search, Download, Printer, MessageCircle, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react';
import { useAdminOrders, useUpdateOrderStatus, useRefundOrder } from '../../hooks/useOrders';
import { ORDER_STATUS_LABELS, type OrderRow, type OrderStatus } from '../../lib/orderTypes';
import { useToast } from '../../hooks/useToast';
import { formatINR } from '../../lib/formatCurrency';
import { getPaymentMethod, isConfirmedOrder, needsAction } from '../../lib/orderHelpers';

const ALL_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAGE_SIZE = 15;

type StatusFilter = 'ALL' | OrderStatus;
type PayFilter = 'ALL' | 'PAID' | 'COD';
type RangeFilter = 'ALL' | 'TODAY' | '7D' | '30D';
type SortKey = 'NEW' | 'OLD' | 'HIGH';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function paymentMethodLabel(method: string) {
  if (method === 'COD') return 'Cash on Delivery';
  if (method === 'THAWANI') return 'Thawani Pay';
  return method;
}
function isPaid(order: OrderRow): boolean {
  return order.paymentStatus === 'SUCCESS';
}
function paymentStatusClass(status: string, method: string) {
  if (status === 'SUCCESS')  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'REFUNDED') return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  if (method === 'COD')      return 'bg-blue-50   text-blue-700   border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}
function paymentStatusLabel(status: string, method: string) {
  if (status === 'SUCCESS')  return 'Paid';
  if (status === 'REFUNDED') return 'Refunded';
  if (method === 'COD')      return 'Pay on delivery';
  if (status === 'PENDING')  return 'Awaiting payment';
  return status.charAt(0) + status.slice(1).toLowerCase();
}
function orderStatusConfig(status: string): { cls: string; dot: string; label: string } {
  switch (status) {
    case 'PENDING':    return { cls: 'bg-neutral-100 text-neutral-600 border-neutral-200',   dot: 'bg-neutral-400',  label: 'Pending' };
    case 'PROCESSING': return { cls: 'bg-indigo-50  text-indigo-700  border-indigo-200',    dot: 'bg-indigo-500',   label: 'Processing' };
    case 'SHIPPED':    return { cls: 'bg-violet-50  text-violet-700  border-violet-200',    dot: 'bg-violet-500',   label: 'Shipped' };
    case 'DELIVERED':  return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',   dot: 'bg-emerald-500',  label: 'Delivered' };
    case 'CANCELLED':  return { cls: 'bg-red-50     text-red-700     border-red-200',       dot: 'bg-red-500',      label: 'Cancelled' };
    default:           return { cls: 'bg-neutral-100 text-neutral-600 border-neutral-200',  dot: 'bg-neutral-400',  label: status };
  }
}

type Addr = Record<string, string | undefined>;
const addrOf = (o: OrderRow): Addr => (o.shippingAddress ?? {}) as Addr;
const customerName = (o: OrderRow) =>
  o.user?.name || `${addrOf(o).firstName ?? ''} ${addrOf(o).lastName ?? ''}`.trim() || 'Guest';
const customerEmail = (o: OrderRow) => o.user?.email || addrOf(o).email || '';
const customerPhone = (o: OrderRow) => o.user?.phone || addrOf(o).phone || '';

function timeAgo(iso: string, now: number): string {
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** CSV cell: quoted, newlines flattened, spreadsheet formula injection neutralised. */
function csvCell(value: unknown): string {
  let v = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function exportOrdersCsv(orders: OrderRow[]) {
  const header = ['Order', 'Date', 'Customer', 'Email', 'Phone', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Method', 'Payment', 'Status', 'City', 'Address'];
  const rows = orders.map((o) => {
    const a = addrOf(o);
    const method = getPaymentMethod(o);
    return [
      o.orderNumber, new Date(o.placedAt).toISOString(), customerName(o), customerEmail(o), customerPhone(o),
      o.items.map((i) => `${i.productName} x${i.quantity}`).join('; '),
      o.subtotal, o.discount, o.shipping, o.total,
      paymentMethodLabel(method), paymentStatusLabel(o.paymentStatus, method), orderStatusConfig(o.orderStatus).label,
      a.city, [a.addressLine1 || a.address, a.addressLine2 || a.apartment, a.city, a.state, a.pincode || a.postalCode].filter(Boolean).join(', '),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Opens a clean packing slip in a new window and prints it. All dynamic text is HTML-escaped. */
function printPackingSlip(o: OrderRow) {
  const a = addrOf(o);
  const method = getPaymentMethod(o);
  const rows = o.items
    .map((i) => `<tr><td>${escapeHtml(i.productName)}<div class="sku">${escapeHtml(i.sku)}</div></td><td class="c">${i.quantity}</td><td class="r">${escapeHtml(formatINR(Number(i.price)))}</td><td class="r">${escapeHtml(formatINR(Number(i.price) * i.quantity))}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${escapeHtml(o.orderNumber)}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}
 h1{font-size:20px;margin:0 0 4px} .muted{color:#666} .sku{color:#888;font-size:11px}
 .grid{display:flex;gap:32px;margin:20px 0} .grid>div{flex:1}
 table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left}
 th{font-size:11px;text-transform:uppercase;color:#666} .c{text-align:center} .r{text-align:right}
 .tot td{border:none;padding:3px 6px} .grand td{font-weight:bold;font-size:15px;border-top:2px solid #111;padding-top:8px}
 @media print{body{margin:12px}}
</style></head><body>
<h1>Superior Trends — Packing Slip</h1>
<div class="muted">Order ${escapeHtml(o.orderNumber)} · ${escapeHtml(new Date(o.placedAt).toLocaleString('en-GB'))}</div>
<div class="grid">
 <div><b>Ship to</b><br>${escapeHtml(customerName(o))}<br>${escapeHtml(a.addressLine1 || a.address)}${a.addressLine2 || a.apartment ? '<br>' + escapeHtml(a.addressLine2 || a.apartment) : ''}<br>${escapeHtml([a.city, a.state].filter(Boolean).join(', '))} ${escapeHtml(a.pincode || a.postalCode)}<br>${escapeHtml(a.country)}<br>${escapeHtml(customerPhone(o))}</div>
 <div><b>Payment</b><br>${escapeHtml(paymentMethodLabel(method))}<br>${escapeHtml(paymentStatusLabel(o.paymentStatus, method))}${method === 'COD' && !isPaid(o) ? `<br><b>Collect ${escapeHtml(formatINR(Number(o.total)))} on delivery</b>` : ''}</div>
</div>
<table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot" style="width:280px;margin-left:auto">
 <tr><td>Subtotal</td><td class="r">${escapeHtml(formatINR(Number(o.subtotal)))}</td></tr>
 ${Number(o.discount) > 0 ? `<tr><td>Discount</td><td class="r">−${escapeHtml(formatINR(Number(o.discount)))}</td></tr>` : ''}
 <tr><td>Delivery</td><td class="r">${Number(o.shipping) === 0 ? 'Free' : escapeHtml(formatINR(Number(o.shipping)))}</td></tr>
 <tr class="grand"><td>Total</td><td class="r">${escapeHtml(formatINR(Number(o.total)))}</td></tr>
</table>
${o.notes ? `<p><b>Customer note:</b> ${escapeHtml(o.notes)}</p>` : ''}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** wa.me link with a prefilled message (digits only in the phone number) */
function whatsappHref(o: OrderRow): string | null {
  const digits = customerPhone(o).replace(/\D/g, '');
  if (digits.length < 8) return null;
  const msg = `Hi ${customerName(o)}, this is Superior Trends regarding your order ${o.orderNumber} (${orderStatusConfig(o.orderStatus).label}).`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

/* ─── Component ───────────────────────────────────────────────────────────── */
export const AdminOrders: React.FC = () => {
  const { data: allOrders = [], isLoading, isError, refetch, isFetching } = useAdminOrders();
  // Only real orders (payment confirmed, or COD) are shown. Unpaid online checkouts stay hidden.
  const orders = useMemo(() => allOrders.filter(isConfirmedOrder), [allOrders]);
  const updateStatus = useUpdateOrderStatus();
  const refundOrder = useRefundOrder();
  const { showToast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrder = useMemo(() => orders.find((o: OrderRow) => o.id === selectedId) ?? null, [orders, selectedId]);
  const setSelectedOrder = (o: OrderRow | null) => setSelectedId(o?.id ?? null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [payFilter, setPayFilter] = useState<PayFilter>('ALL');
  const [range, setRange] = useState<RangeFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('NEW');
  const [page, setPage] = useState(1);

  // "now" lives in state (refreshed each minute) so relative times stay fresh without impure calls in render
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // New orders appear without a manual refresh
  useEffect(() => {
    const t = setInterval(() => { refetch(); }, 30_000);
    return () => clearInterval(t);
  }, [refetch]);

  /* scroll lock + Esc to close */
  useEffect(() => {
    if (!selectedOrder) return;
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [selectedOrder]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await updateStatus.mutateAsync({ id: orderId, orderStatus: newStatus });
      showToast(`Order updated to ${ORDER_STATUS_LABELS[newStatus as OrderStatus] || newStatus}`, 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update status';
      showToast(msg, 'error');
    }
  };

  /* stats */
  const stats = useMemo(() => {
    const live = orders.filter((o: OrderRow) => o.orderStatus !== 'CANCELLED');
    return {
      total: orders.length,
      action: orders.filter(needsAction).length,
      shipped: orders.filter((o: OrderRow) => o.orderStatus === 'SHIPPED').length,
      delivered: orders.filter((o: OrderRow) => o.orderStatus === 'DELIVERED').length,
      revenue: live.filter(isPaid).reduce((sum: number, o: OrderRow) => sum + Number(o.total), 0),
    };
  }, [orders]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: orders.length };
    for (const s of ALL_STATUSES) c[s] = orders.filter((o: OrderRow) => o.orderStatus === s).length;
    return c;
  }, [orders]);

  /* filter + sort */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const minTime =
      range === 'TODAY' ? startOfToday.getTime()
      : range === '7D' ? now - 7 * 86_400_000
      : range === '30D' ? now - 30 * 86_400_000
      : 0;

    const list = orders.filter((o: OrderRow) => {
      if (statusFilter !== 'ALL' && o.orderStatus !== statusFilter) return false;
      const method = getPaymentMethod(o);
      if (payFilter === 'PAID' && !isPaid(o)) return false;
      if (payFilter === 'COD' && method !== 'COD') return false;
      if (minTime && new Date(o.placedAt).getTime() < minTime) return false;
      if (!q) return true;
      return [o.orderNumber, customerName(o), customerEmail(o), customerPhone(o), ...o.items.map((i) => i.productName)]
        .some((f) => (f ?? '').toLowerCase().includes(q));
    });

    list.sort((a: OrderRow, b: OrderRow) =>
      sort === 'HIGH' ? Number(b.total) - Number(a.total)
      : sort === 'OLD' ? new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
      : new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
    return list;
  }, [orders, search, statusFilter, payFilter, range, sort, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersActive = statusFilter !== 'ALL' || payFilter !== 'ALL' || range !== 'ALL' || search.trim() !== '';
  const resetFilters = () => { setStatusFilter('ALL'); setPayFilter('ALL'); setRange('ALL'); setSearch(''); setPage(1); };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
      active ? 'bg-[#8b1a2a] text-white' : 'bg-white border border-neutral-200 text-neutral-500 hover:border-[#8b1a2a] hover:text-[#8b1a2a]'
    }`;

  return (
    <>
      <div className="space-y-5 px-1">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag size={20} className="text-[#8b1a2a]" />
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Orders</h1>
              {stats.action > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#8b1a2a] text-white text-xs font-bold">
                  {stats.action} to process
                </span>
              )}
            </div>
            <p className="text-[15px] text-neutral-500">Manage fulfilment for Thawani Pay and COD orders.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-50 transition-colors"
            >
              {isFetching ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => exportOrdersCsv(filtered)}
              disabled={filtered.length === 0}
              title="Download the orders currently shown as CSV"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 transition-colors"
            >
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total orders', value: stats.total, color: 'text-neutral-800' },
            { label: 'To process', value: stats.action, color: 'text-amber-600' },
            { label: 'Shipped', value: stats.shipped, color: 'text-violet-700' },
            { label: 'Delivered', value: stats.delivered, color: 'text-emerald-700' },
            { label: 'Paid revenue', value: formatINR(stats.revenue), color: 'text-[#8b1a2a]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-neutral-200 px-4 py-3">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-[13px] text-neutral-400 font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        {orders.length > 0 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search order no., customer, email, phone, product…"
                  className="w-full pl-9 pr-9 py-2.5 text-[13px] rounded-lg bg-neutral-50 border border-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:border-[#8b1a2a] focus:bg-white"
                />
                {search && (
                  <button type="button" onClick={() => { setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select value={range} onChange={(e) => { setRange(e.target.value as RangeFilter); setPage(1); }}
                  className="px-3 py-2.5 text-[13px] font-semibold rounded-lg bg-neutral-50 border border-neutral-200 focus:outline-none focus:border-[#8b1a2a]">
                  <option value="ALL">All time</option>
                  <option value="TODAY">Today</option>
                  <option value="7D">Last 7 days</option>
                  <option value="30D">Last 30 days</option>
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                  className="px-3 py-2.5 text-[13px] font-semibold rounded-lg bg-neutral-50 border border-neutral-200 focus:outline-none focus:border-[#8b1a2a]">
                  <option value="NEW">Newest first</option>
                  <option value="OLD">Oldest first</option>
                  <option value="HIGH">Highest value</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['ALL', ...ALL_STATUSES] as StatusFilter[]).map((s) => (
                <button key={s} type="button" onClick={() => { setStatusFilter(s); setPage(1); }} className={chip(statusFilter === s)}>
                  {s === 'ALL' ? 'All' : ORDER_STATUS_LABELS[s]} <span className="opacity-70">({statusCounts[s] ?? 0})</span>
                </button>
              ))}
              <span className="w-px bg-neutral-200 mx-1 hidden sm:block" />
              {([['ALL', 'Any payment'], ['PAID', 'Paid'], ['COD', 'COD']] as [PayFilter, string][]).map(([k, label]) => (
                <button key={k} type="button" onClick={() => { setPayFilter(k); setPage(1); }} className={chip(payFilter === k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <div className="flex justify-center items-center py-24 gap-3 text-neutral-400">
            <Loader2 className="animate-spin text-[#8b1a2a]" size={22} />
            <span className="text-[15px]">Loading orders…</span>
          </div>
        ) : isError ? (
          <div className="py-16 text-center border border-dashed border-red-200 bg-red-50 rounded-2xl">
            <p className="text-red-600 text-[15px] font-semibold">Failed to load orders.</p>
            <button type="button" onClick={() => refetch()} className="mt-2 text-[13px] font-bold text-red-700 underline">Try again</button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-neutral-200 bg-white rounded-2xl">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
              <Package size={22} className="text-neutral-400" />
            </div>
            <p className="text-[15px] font-semibold text-neutral-600">No orders yet</p>
            <p className="text-[13px] text-neutral-400 mt-1">Orders will appear here once customers start purchasing.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 bg-white rounded-2xl">
            <p className="text-[15px] font-semibold text-neutral-600">No orders match these filters</p>
            {filtersActive && (
              <button type="button" onClick={resetFilters} className="mt-2 text-xs font-bold uppercase tracking-wider text-[#8b1a2a] hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/80">
                    {['Order', 'Customer', 'Total', 'Payment', 'Status', 'Placed', 'Update', ''].map(h => (
                      <th key={h} className="px-4 py-3.5 text-xs font-bold text-neutral-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pageRows.map((order: OrderRow) => {
                    const payMethod = getPaymentMethod(order);
                    const sc = orderStatusConfig(order.orderStatus);
                    const isTerminal = order.orderStatus === 'DELIVERED' || order.orderStatus === 'CANCELLED';
                    const first = order.items[0];
                    const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
                    const phone = customerPhone(order);
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="cursor-pointer hover:bg-neutral-50/70 transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="size-11 shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden">
                              {first?.image
                                ? <img src={first.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-neutral-300"><Package size={16} /></div>}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-mono font-bold text-neutral-900">{order.orderNumber}</p>
                              <p className="text-xs text-neutral-400 truncate max-w-[170px] mt-0.5">
                                {itemCount} item{itemCount !== 1 ? 's' : ''}{first ? ` · ${first.productName}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-[13px] font-semibold text-neutral-800">{customerName(order)}</p>
                          <p className="text-xs text-neutral-400 truncate max-w-[170px] mt-0.5">{customerEmail(order) || '—'}</p>
                          {phone && <p className="text-xs text-neutral-400 mt-0.5">{phone}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[13px] font-bold text-[#8b1a2a]">{formatINR(Number(order.total))}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${paymentStatusClass(order.paymentStatus, payMethod)}`}>
                              {paymentStatusLabel(order.paymentStatus, payMethod)}
                            </span>
                            <span className="text-xs text-neutral-400">{paymentMethodLabel(payMethod)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold border ${sc.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-[13px] text-neutral-700 font-medium">{timeAgo(order.placedAt, now)}</p>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {new Date(order.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {isTerminal ? (
                            <span className={`text-xs font-bold ${order.orderStatus === 'DELIVERED' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {order.orderStatus === 'DELIVERED' ? '✓ Delivered' : '✕ Cancelled'}
                            </span>
                          ) : (
                            <select
                              value={order.orderStatus}
                              onChange={e => e.target.value !== order.orderStatus && handleStatusChange(order.id, e.target.value)}
                              disabled={updateStatus.isPending}
                              className="bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-neutral-800 text-xs font-semibold focus:outline-none focus:border-[#8b1a2a] hover:border-neutral-300 disabled:opacity-50"
                            >
                              {ALL_STATUSES.map(s => (
                                <option key={s} value={s}>{ORDER_STATUS_LABELS[s] || s}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-xs font-bold text-[#8b1a2a] bg-[#8b1a2a]/6 px-3 py-1.5 rounded-lg border border-[#8b1a2a]/15 whitespace-nowrap">
                            Details
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-neutral-100 bg-neutral-50/60">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} aria-label="Previous page"
                    className="size-8 flex items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-500">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[13px] font-semibold text-neutral-600 px-1">{safePage} / {pageCount}</span>
                  <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount} aria-label="Next page"
                    className="size-8 flex items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-500">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Drawer ──────────────────────────────────────────────────────────── */}
      {selectedOrder && (() => {
        const payMethod = getPaymentMethod(selectedOrder);
        const sc = orderStatusConfig(selectedOrder.orderStatus);
        return (
          <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
            {/* backdrop */}
            <div
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              onClick={() => setSelectedOrder(null)}
            />

            {/* panel */}
            <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl">
              <div className="w-full bg-white shadow-2xl border-l border-neutral-200 h-full overflow-y-auto overscroll-contain">

                {/* Drawer header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b border-neutral-100 bg-white">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[17px] font-bold text-neutral-900">Order Details</h2>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold border ${sc.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-[13px] text-neutral-400 font-mono mt-0.5">{selectedOrder.orderNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => printPackingSlip(selectedOrder)}
                      title="Print packing slip"
                      aria-label="Print packing slip"
                      className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors border border-neutral-200"
                    >
                      <Printer size={16} />
                    </button>
                    {whatsappHref(selectedOrder) && (
                      <a
                        href={whatsappHref(selectedOrder)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Message customer on WhatsApp"
                        aria-label="Message customer on WhatsApp"
                        className="p-2 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors border border-neutral-200"
                      >
                        <MessageCircle size={16} />
                      </a>
                    )}
                    <button
                      onClick={() => setSelectedOrder(null)}
                      aria-label="Close"
                      className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors border border-neutral-200"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Drawer body */}
                <div className="px-6 py-6 space-y-6">

                    {/* Quick stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-neutral-50 rounded-xl border border-neutral-100 px-4 py-3">
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Grand Total</div>
                        <div className="text-[17px] font-bold text-[#8b1a2a]">{formatINR(Number(selectedOrder.total))}</div>
                      </div>
                      <div className="bg-neutral-50 rounded-xl border border-neutral-100 px-4 py-3">
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Items</div>
                        <div className="text-[17px] font-bold text-neutral-800">{selectedOrder.items?.length ?? 0}</div>
                      </div>
                      <div className="bg-neutral-50 rounded-xl border border-neutral-100 px-4 py-3">
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Placed</div>
                        <div className="text-[13px] font-semibold text-neutral-700">
                          {new Date(selectedOrder.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Customer */}
                    <div>
                      <SectionTitle icon={<User size={13} />}>Customer</SectionTitle>
                      <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <InfoItem label="Name">{selectedOrder.user?.name || 'Guest'}</InfoItem>
                        <InfoItem label="Email">
                          <a
                            href={`mailto:${selectedOrder.user?.email || (selectedOrder.shippingAddress as any)?.email}`}
                            className="text-[#8b1a2a] hover:underline flex items-center gap-1"
                          >
                            <Mail size={11} />
                            <span>
                              {selectedOrder.user?.email || (selectedOrder.shippingAddress as any)?.email || '—'}
                            </span>
                          </a>
                        </InfoItem>
                        <InfoItem label="Phone">
                          <span className="flex items-center gap-1">
                            <Phone size={11} className="text-neutral-400" />
                            {selectedOrder.user?.phone || (selectedOrder.shippingAddress as any)?.phone || '—'}
                          </span>
                        </InfoItem>
                      </div>
                    </div>

                    {/* Addresses */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <SectionTitle icon={<MapPin size={13} />}>Shipping Address</SectionTitle>
                        <AddressCard addr={selectedOrder.shippingAddress as any} />
                      </div>
                      <div>
                        <SectionTitle icon={<CreditCard size={13} />}>Billing Address</SectionTitle>
                        <AddressCard addr={(selectedOrder.billingAddress || selectedOrder.shippingAddress) as any} />
                      </div>
                    </div>

                    {/* Items */}
                    <div>
                      <SectionTitle icon={<Package size={13} />}>
                        Items &nbsp;<span className="text-neutral-400 font-normal normal-case">({selectedOrder.items?.length ?? 0})</span>
                      </SectionTitle>
                      <div className="space-y-2">
                        {selectedOrder.items?.map(item => (
                          <div key={item.id} className="flex items-center gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-100 hover:border-neutral-200 transition-colors">
                            <div className="w-14 h-14 shrink-0 rounded-lg border border-neutral-200 bg-white overflow-hidden">
                              {item.image
                                ? <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-neutral-300"><Package size={18} /></div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-neutral-900 truncate">{item.productName}</p>
                              <p className="text-xs text-neutral-400 font-mono mt-0.5">{item.sku}</p>
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[11px] font-bold">
                                Qty: {item.quantity}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[13px] font-bold text-neutral-900">{formatINR(Number(item.price))}</p>
                              <p className="text-xs text-neutral-400 mt-0.5">= {formatINR(Number(item.price) * item.quantity)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payment + Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <SectionTitle icon={<Truck size={13} />}>Payment</SectionTitle>
                        <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4 space-y-3">
                          <Row label="Method">{paymentMethodLabel(payMethod)}</Row>
                          <Row label="Status">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${paymentStatusClass(selectedOrder.paymentStatus, payMethod)}`}>
                              {paymentStatusLabel(selectedOrder.paymentStatus, payMethod)}
                            </span>
                          </Row>
                          {selectedOrder.payments?.[0]?.thawaniSessionId && (
                            <div className="pt-2 border-t border-neutral-100">
                              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Thawani Session ID</div>
                              <div className="text-xs font-mono text-neutral-600 break-all">{selectedOrder.payments[0].thawaniSessionId}</div>
                            </div>
                          )}
                          {selectedOrder.payments?.[0]?.thawaniPaymentId && (
                            <div>
                              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-0.5">Thawani Payment ID</div>
                              <div className="text-xs font-mono text-neutral-600 break-all">{selectedOrder.payments[0].thawaniPaymentId}</div>
                            </div>
                          )}
                          {payMethod === 'THAWANI' && selectedOrder.paymentStatus === 'SUCCESS' && (
                            <button
                              type="button"
                              disabled={refundOrder.isPending}
                              onClick={() => {
                                if (!confirm(`Refund ${formatINR(Number(selectedOrder.total))} for order #${selectedOrder.orderNumber}? This cannot be undone.`)) return;
                                refundOrder.mutate(selectedOrder.id, {
                                  onSuccess: () => showToast('Payment refunded successfully', 'success'),
                                  onError: (err: any) => showToast(err?.response?.data?.message || 'Refund failed', 'error'),
                                });
                              }}
                              className="w-full flex items-center justify-center gap-1.5 pt-2 mt-1 border-t border-neutral-100 text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                            >
                              {refundOrder.isPending ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                              Refund Payment
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <SectionTitle icon={<Calendar size={13} />}>Amount Breakdown</SectionTitle>
                        <div className="bg-[#8b1a2a]/4 rounded-xl border border-[#8b1a2a]/10 p-4 space-y-2">
                          <Row label="Subtotal">{formatINR(Number(selectedOrder.subtotal))}</Row>
                          {Number(selectedOrder.discount) > 0 && (
                            <Row label="Discount" className="text-emerald-600">
                              <span className="text-emerald-600">−{formatINR(Number(selectedOrder.discount))}</span>
                            </Row>
                          )}
                          <Row label="Delivery">
                            {Number(selectedOrder.shipping) === 0 ? <span className="text-emerald-600 font-bold">FREE</span> : formatINR(Number(selectedOrder.shipping))}
                          </Row>
                          {Number(selectedOrder.tax) > 0 && (
                            <Row label="GST / Tax">{formatINR(Number(selectedOrder.tax))}</Row>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-[#8b1a2a]/15">
                            <span className="text-[15px] font-bold text-neutral-900">Grand Total</span>
                            <span className="text-[17px] font-bold text-[#8b1a2a]">{formatINR(Number(selectedOrder.total))}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {selectedOrder.notes && (
                      <div>
                        <SectionTitle>Customer Note</SectionTitle>
                        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-[13px] text-amber-900 italic leading-relaxed">
                          "{selectedOrder.notes}"
                        </div>
                      </div>
                    )}

                    {/* Status updater in drawer */}
                    {selectedOrder.orderStatus !== 'DELIVERED' && selectedOrder.orderStatus !== 'CANCELLED' && (
                      <div className="pb-2">
                        <SectionTitle>Update Status</SectionTitle>
                        <div className="flex flex-wrap gap-2">
                          {ALL_STATUSES.filter(s => s !== selectedOrder.orderStatus).map(s => {
                            const cfg = orderStatusConfig(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleStatusChange(selectedOrder.id, s)}
                                disabled={updateStatus.isPending}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border uppercase tracking-wider transition-all hover:shadow-sm active:scale-95 disabled:opacity-50 ${cfg.cls}`}
                              >
                                {updateStatus.isPending ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                                {cfg.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}
    </>
  );
};

/* ─── Small sub-components ────────────────────────────────────────────────── */
function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {icon && <span className="text-[#8b1a2a]">{icon}</span>}
      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{children}</h3>
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[13px] font-semibold text-neutral-800">{children}</div>
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex justify-between items-center text-[13px] ${className ?? ''}`}>
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold text-neutral-800">{children}</span>
    </div>
  );
}

function AddressCard({ addr }: { addr: any }) {
  if (!addr) return (
    <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4 text-[13px] text-neutral-400 min-h-[100px] flex items-center">
      No address provided
    </div>
  );
  return (
    <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4 text-[13px] text-neutral-700 leading-relaxed space-y-0.5">
      <p className="font-bold text-neutral-900">{addr.firstName} {addr.lastName || addr.fullName}</p>
      <p>{addr.addressLine1 || addr.address}</p>
      {(addr.addressLine2 || addr.apartment) && <p>{addr.addressLine2 || addr.apartment}</p>}
      <p>{addr.city}, {addr.state} — {addr.pincode || addr.postalCode}</p>
      <p className="text-xs font-bold text-neutral-400 uppercase">{addr.country || 'India'}</p>
      {addr.phone && <p className="text-xs text-neutral-500 flex items-center gap-1 pt-1"><Phone size={10} />{addr.phone}</p>}
    </div>
  );
}