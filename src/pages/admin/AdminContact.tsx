import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Mail, Trash2, ChevronRight, Inbox, Clock, Reply, Search, Copy, Check,
  MailOpen, MailCheck, Download, X, Users,
} from 'lucide-react';
import { useContactMessagesAdmin, useContactAdminMutations } from '../../hooks/useContact';
import type { ContactMessage } from '../../lib/blogTypes';

type Filter = 'ALL' | 'NEW' | 'READ';

/** "5m ago", "3h ago", "2d ago", else a short date */
function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
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

function exportCsv(messages: ContactMessage[]) {
  const header = ['Date', 'Name', 'Email', 'Subject', 'Message', 'Status'];
  const rows = messages.map((m) => [
    new Date(m.createdAt).toISOString(), m.name, m.email, m.subject, m.message, m.status === 'NEW' ? 'Unread' : 'Read',
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contact-messages-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const AdminContact: React.FC = () => {
  const { data: messages = [], isLoading } = useContactMessagesAdmin();
  const { markRead, remove } = useContactAdminMutations();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // Current time lives in state (refreshed every minute) so relative times and stats stay fresh without impure calls during render
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const selected = useMemo(
    () => messages.find((m: ContactMessage) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  const stats = useMemo(() => {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return {
      total: messages.length,
      unread: messages.filter((m: ContactMessage) => m.status === 'NEW').length,
      today: messages.filter((m: ContactMessage) => new Date(m.createdAt) >= startOfToday).length,
      week: messages.filter((m: ContactMessage) => now - new Date(m.createdAt).getTime() <= 7 * 86_400_000).length,
    };
  }, [messages, now]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m: ContactMessage) => {
      if (filter !== 'ALL' && m.status !== filter) return false;
      if (!q) return true;
      return [m.name, m.email, m.subject, m.message].some((f) => (f ?? '').toLowerCase().includes(q));
    });
  }, [messages, filter, query]);

  // Other messages from the same sender (by email)
  const sameSender = useMemo(
    () => (selected ? messages.filter((m: ContactMessage) => m.email === selected.email && m.id !== selected.id) : []),
    [messages, selected],
  );

  const openMessage = (msg: ContactMessage) => {
    setSelectedId(msg.id);
    setConfirmDelete(false);
    setCopied(false);
    if (msg.status === 'NEW') markRead.mutate({ id: msg.id, status: 'READ' });
    // On small screens the detail panel sits below the list — bring it into view
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await Promise.all(
        messages
          .filter((m: ContactMessage) => m.status === 'NEW')
          .map((m: ContactMessage) => markRead.mutateAsync({ id: m.id, status: 'READ' })),
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const copyEmail = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const replyHref = selected
    ? `mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject || 'Your enquiry'}`)}&body=${encodeURIComponent(
        `Hi ${selected.name},\n\nThank you for contacting Superior Trends.\n\n\n\n--- Your message ---\n${selected.message}`,
      )}`
    : '#';

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: stats.total },
    { key: 'NEW', label: 'Unread', count: stats.unread },
    { key: 'READ', label: 'Read', count: stats.total - stats.unread },
  ];

  return (
    <div className="max-w-6xl w-full font-display">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#8b1a2a]">Admin</span>
          <ChevronRight size={10} className="text-neutral-300" />
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400">Inbox</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-end gap-3">
              <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight leading-none">Contact Messages</h1>
              {stats.unread > 0 && (
                <span className="mb-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-[#8b1a2a] text-white text-xs font-bold">
                  {stats.unread} new
                </span>
              )}
            </div>
            <p className="text-[13px] text-neutral-400 mt-2">Inquiries submitted through the storefront contact form.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllRead}
              disabled={stats.unread === 0 || markingAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-600 transition-colors"
            >
              {markingAll ? <Loader2 size={12} className="animate-spin" /> : <MailCheck size={12} />}
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => exportCsv(visible)}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-600 hover:border-[#8b1a2a] hover:text-[#8b1a2a] disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-600 transition-colors"
              title="Download the messages currently shown as CSV"
            >
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="animate-spin text-[#8b1a2a]" size={22} />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Loading inbox…</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-neutral-200 rounded-2xl bg-white gap-3">
          <div className="size-14 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center">
            <Inbox size={22} className="text-neutral-300" />
          </div>
          <p className="text-[15px] font-bold text-neutral-500">No messages yet</p>
          <p className="text-[13px] text-neutral-400">Messages from your contact form will appear here.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Unread', value: stats.unread, accent: stats.unread > 0 },
              { label: 'Today', value: stats.today },
              { label: 'Last 7 days', value: stats.week },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-neutral-200 rounded-xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400">{s.label}</p>
                <p className={`text-2xl font-extrabold mt-0.5 ${s.accent ? 'text-[#8b1a2a]' : 'text-neutral-900'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
            {/* ── Message list ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className="h-1 bg-gradient-to-r from-[#8b1a2a] via-[#c0364a] to-[#8b1a2a]" />

              {/* Search + filter tabs */}
              <div className="p-3 border-b border-neutral-100 space-y-2.5">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, email, subject, message…"
                    className="w-full pl-8 pr-8 py-2 text-[13px] rounded-lg bg-neutral-50 border border-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:border-[#8b1a2a] focus:bg-white"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setFilter(t.key)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                        filter === t.key ? 'bg-[#8b1a2a] text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                      }`}
                    >
                      {t.label} <span className="opacity-70">({t.count})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-neutral-100 max-h-[60vh] overflow-y-auto" data-lenis-prevent>
                {visible.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[13px] font-bold text-neutral-500">No messages match</p>
                    <button
                      type="button"
                      onClick={() => { setQuery(''); setFilter('ALL'); }}
                      className="mt-2 text-xs font-bold uppercase tracking-wider text-[#8b1a2a] hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  visible.map((msg: ContactMessage) => {
                    const isNew = msg.status === 'NEW';
                    const isActive = selectedId === msg.id;
                    return (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => openMessage(msg)}
                        className={`w-full text-left px-4 py-3.5 transition-colors relative ${isActive ? 'bg-[#8b1a2a]/5' : 'hover:bg-neutral-50/80'}`}
                      >
                        {isNew && <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-[#8b1a2a] rounded-r-full" />}
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] truncate ${isNew ? 'font-extrabold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
                            {msg.name}
                          </p>
                          <span className="shrink-0 text-[11px] text-neutral-400 font-medium">{timeAgo(msg.createdAt, now)}</span>
                        </div>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">{msg.email}</p>
                        {msg.subject && <p className="text-[13px] text-neutral-600 truncate mt-1 font-semibold">{msg.subject}</p>}
                        <p className="text-[13px] text-neutral-400 line-clamp-2 mt-0.5 leading-snug">{msg.message}</p>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-4 py-2 border-t border-neutral-100 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Showing {visible.length} of {messages.length}
              </div>
            </div>

            {/* ── Message detail ── */}
            <div
              ref={detailRef}
              className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)] lg:sticky lg:top-20 scroll-mt-20"
            >
              <div
                className="h-1 bg-gradient-to-r from-neutral-200 via-neutral-300 to-neutral-200"
                style={selected ? { backgroundImage: 'linear-gradient(to right, #8b1a2a, #c0364a, #8b1a2a)' } : {}}
              />

              {selected ? (
                <div className="p-6">
                  {/* Sender */}
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-[#8b1a2a]/10 flex items-center justify-center shrink-0 text-[#8b1a2a] font-extrabold text-[15px]">
                        {selected.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[17px] font-extrabold text-neutral-900 leading-tight truncate">{selected.name}</h2>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <a href={`mailto:${selected.email}`} className="text-[13px] text-[#8b1a2a] hover:underline truncate">
                            {selected.email}
                          </a>
                          <button
                            type="button"
                            onClick={copyEmail}
                            aria-label="Copy email"
                            title="Copy email"
                            className="shrink-0 p-1 text-neutral-300 hover:text-neutral-600 transition-colors"
                          >
                            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => markRead.mutate({ id: selected.id, status: selected.status === 'NEW' ? 'READ' : 'NEW' })}
                        title={selected.status === 'NEW' ? 'Mark as read' : 'Mark as unread'}
                        aria-label={selected.status === 'NEW' ? 'Mark as read' : 'Mark as unread'}
                        className="size-8 flex items-center justify-center rounded-lg text-neutral-300 hover:text-[#8b1a2a] hover:bg-[#8b1a2a]/5 transition-colors"
                      >
                        {selected.status === 'NEW' ? <MailOpen size={15} /> : <Mail size={15} />}
                      </button>

                      {confirmDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              remove.mutate(selected.id);
                              setSelectedId(null);
                              setConfirmDelete(false);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="px-2 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-bold uppercase tracking-wider hover:bg-neutral-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          title="Delete message"
                          aria-label="Delete message"
                          className="size-8 flex items-center justify-center rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {selected.subject && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-100">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-0.5">Subject</p>
                      <p className="text-[13px] font-semibold text-neutral-700">{selected.subject}</p>
                    </div>
                  )}

                  <div className="mb-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-2">Message</p>
                    <p className="text-[15px] text-neutral-700 leading-relaxed whitespace-pre-wrap break-words">{selected.message}</p>
                  </div>

                  {/* Other messages from the same sender */}
                  {sameSender.length > 0 && (
                    <div className="mb-5 rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-2">
                        <Users size={10} />
                        {sameSender.length} other message{sameSender.length > 1 ? 's' : ''} from this sender
                      </p>
                      <div className="space-y-1">
                        {sameSender.slice(0, 5).map((m: ContactMessage) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => openMessage(m)}
                            className="w-full flex items-center justify-between gap-3 text-left px-2 py-1.5 rounded-md hover:bg-white transition-colors"
                          >
                            <span className="text-[13px] font-semibold text-neutral-600 truncate">{m.subject || m.message}</span>
                            <span className="shrink-0 text-[11px] text-neutral-400">{timeAgo(m.createdAt, now)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-100">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="text-neutral-300" />
                      <p className="text-[11px] text-neutral-400">
                        {new Date(selected.createdAt).toLocaleString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <a
                      href={replyHref}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8b1a2a] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#6f1522] transition-colors shadow-sm"
                    >
                      <Reply size={11} />
                      Reply by email
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[360px] gap-3 text-neutral-300">
                  <Mail size={28} className="opacity-40" />
                  <p className="text-xs font-bold uppercase tracking-[0.2em]">Select a message to read</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
