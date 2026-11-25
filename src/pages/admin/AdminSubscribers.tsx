import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MailPlus, Trash2, Search, Download, Copy, Check, Users, CalendarDays, Clock } from 'lucide-react';
import {
  useNewsletterSubscribersAdmin,
  useRemoveNewsletterSubscriber,
  type NewsletterSubscriber,
} from '../../hooks/useNewsletter';
import { useToast } from '../../hooks/useToast';

/** "5m ago", "3h ago", "2d ago", else a short date */
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

/** CSV cell: quote it and neutralise spreadsheet formula injection (=, +, -, @) from user-submitted text. */
function csvCell(value: string | null | undefined): string {
  let v = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function exportCsv(subscribers: NewsletterSubscriber[]) {
  const header = ['Email', 'Subscribed on', 'Status'];
  const rows = subscribers.map((s) => [s.email, new Date(s.createdAt).toISOString(), s.isActive ? 'Active' : 'Inactive']);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const AdminSubscribers: React.FC = () => {
  const { data: subscribers = [], isLoading, isError } = useNewsletterSubscribersAdmin();
  const remove = useRemoveNewsletterSubscriber();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Current time lives in state (refreshed every minute) so relative times and stats stay fresh
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return {
      total: subscribers.length,
      today: subscribers.filter((s) => new Date(s.createdAt) >= startOfToday).length,
      week: subscribers.filter((s) => now - new Date(s.createdAt).getTime() <= 7 * 86_400_000).length,
    };
  }, [subscribers, now]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? subscribers.filter((s) => s.email.toLowerCase().includes(q)) : subscribers;
  }, [subscribers, query]);

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(visible.map((s) => s.email).join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleRemove = async (s: NewsletterSubscriber) => {
    if (!window.confirm(`Remove ${s.email} from the newsletter list?`)) return;
    try {
      await remove.mutateAsync(s.id);
      showToast('Subscriber removed', 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to remove subscriber';
      showToast(msg, 'error');
    }
  };

  const statCards = [
    { label: 'Total subscribers', value: stats.total, icon: <Users size={16} />, tone: 'text-[#8b1a2a] bg-[#8b1a2a]/8' },
    { label: 'Joined today', value: stats.today, icon: <Clock size={16} />, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Last 7 days', value: stats.week, icon: <CalendarDays size={16} />, tone: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-6 text-left font-display">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-extrabold text-neutral-900 uppercase tracking-tight">
            <MailPlus className="text-[#8b1a2a]" size={26} /> Subscribers
          </h1>
          <p className="text-[13px] text-neutral-500 mt-1">Emails collected from the homepage and footer newsletter forms.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyEmails}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy emails'}
          </button>
          <button
            type="button"
            onClick={() => exportCsv(visible)}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <span className={`size-10 rounded-xl flex items-center justify-center ${c.tone}`}>{c.icon}</span>
            <div>
              <p className="text-2xl font-extrabold text-neutral-900 leading-none">{c.value}</p>
              <p className="text-xs text-neutral-400 mt-1.5">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-100">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email…"
              className="w-full pl-10 pr-4 py-2.5 text-[14px] rounded-lg border border-neutral-200 focus:outline-none focus:border-[#8b1a2a]"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex items-center justify-center text-neutral-400 gap-2">
            <Loader2 className="animate-spin" size={20} /> Loading subscribers…
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-[14px] text-red-600">Couldn&apos;t load subscribers. Please refresh the page.</div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <MailPlus className="mx-auto text-neutral-300 mb-3" size={30} />
            <p className="text-[15px] font-medium text-neutral-600">{subscribers.length === 0 ? 'No subscribers yet' : 'No matches'}</p>
            <p className="text-[13px] text-neutral-400 mt-1">
              {subscribers.length === 0 ? 'Emails entered in the newsletter forms will show up here.' : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-neutral-400">Email</th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-neutral-400">Subscribed</th>
                  <th className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-neutral-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visible.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <a href={`mailto:${s.email}`} className="text-[14px] font-semibold text-neutral-800 hover:text-[#8b1a2a] break-all">
                        {s.email}
                      </a>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <p className="text-[13px] text-neutral-700 font-medium">{timeAgo(s.createdAt, now)}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(s)}
                        disabled={remove.isPending}
                        title="Remove"
                        aria-label={`Remove ${s.email}`}
                        className="p-2 text-neutral-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && visible.length > 0 && (
          <div className="px-6 py-3 border-t border-neutral-100 text-xs font-bold uppercase tracking-wider text-neutral-400">
            Showing {visible.length} of {subscribers.length}
          </div>
        )}
      </div>
    </div>
  );
};
