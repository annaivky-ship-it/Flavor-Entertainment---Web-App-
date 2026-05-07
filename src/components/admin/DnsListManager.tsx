import React, { useEffect, useState } from 'react';
import { ShieldX, Plus, AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react';
import {
  adminListDnsEntries, adminAddDnsEntry, adminExpireDnsEntry,
  type DnsEntry, type DnsMatchType, type DnsSeverity,
} from '../../services/verification';

const DnsListManager: React.FC = () => {
  const [entries, setEntries] = useState<DnsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{
    matchType: DnsMatchType; value: string; reason: string;
    severity: DnsSeverity; expiresAtIso: string; notes: string;
  }>({
    matchType: 'phone_hash', value: '', reason: '', severity: 'silent',
    expiresAtIso: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListDnsEntries({ activeOnly, limit: 200 });
      setEntries(res.entries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeOnly]);

  const handleAdd = async () => {
    if (!form.value || !form.reason) {
      setError('value and reason are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminAddDnsEntry({
        matchType: form.matchType,
        value: form.value.trim(),
        reason: form.reason,
        severity: form.severity,
        expiresAt: form.expiresAtIso ? new Date(form.expiresAtIso).getTime() : undefined,
        notes: form.notes || undefined,
      });
      setShowAdd(false);
      setForm({ matchType: 'phone_hash', value: '', reason: '', severity: 'silent', expiresAtIso: '', notes: '' });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpire = async (entryId: string) => {
    if (!confirm('Mark this DNS entry as expired?')) return;
    try {
      await adminExpireDnsEntry({ entryId });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filtered = entries.filter(e => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      e.value.toLowerCase().includes(f) ||
      e.reason.toLowerCase().includes(f) ||
      e.matchType.toLowerCase().includes(f)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldX className="h-5 w-5 text-orange-400" /> Do-Not-Serve Register
        </h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-400 flex items-center gap-2">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary px-3 py-2 text-sm flex items-center gap-1">
            <Plus className="h-4 w-4" /> Add entry
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-300 mt-0.5" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="card-base !p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Match type</label>
              <select
                className="input-base"
                value={form.matchType}
                onChange={e => setForm(f => ({ ...f, matchType: e.target.value as DnsMatchType }))}
              >
                <option value="phone_hash">phone_hash</option>
                <option value="email_hash">email_hash</option>
                <option value="face_hash">face_hash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Severity</label>
              <select
                className="input-base"
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value as DnsSeverity }))}
              >
                <option value="silent">silent (recommended)</option>
                <option value="explicit">explicit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Expires at (optional)</label>
              <input
                type="datetime-local"
                className="input-base"
                value={form.expiresAtIso}
                onChange={e => setForm(f => ({ ...f, expiresAtIso: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Hashed value (HMAC-SHA256 hex)</label>
            <input
              className="input-base font-mono text-xs"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder="64-char hex"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Reason</label>
            <input
              className="input-base"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Notes (audit only)</label>
            <textarea
              className="input-base h-16"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <button onClick={handleAdd} disabled={submitting} className="btn-primary px-4 py-2 flex items-center gap-2">
            {submitting && <LoaderCircle className="animate-spin h-4 w-4" />} Add to register
          </button>
          <p className="text-[11px] text-zinc-500">
            Entries are immutable — to "remove" one, mark it expired (it'll go inactive).
          </p>
        </div>
      )}

      <input
        type="text"
        placeholder="Filter by value/reason/match type…"
        className="input-base"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {loading ? (
        <p className="text-zinc-400 flex items-center gap-2"><LoaderCircle className="animate-spin h-4 w-4" /> Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-zinc-500 py-4">No entries.</p>}
          {filtered.map(entry => (
            <div key={entry.id} className="card-base !p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 border border-zinc-700 text-zinc-300">
                    {entry.matchType}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs border ${
                    entry.severity === 'silent' ? 'bg-amber-900/30 border-amber-500/40 text-amber-300' :
                    'bg-red-900/30 border-red-500/40 text-red-300'
                  }`}>
                    {entry.severity}
                  </span>
                  {!entry.active && <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 border border-zinc-700 text-zinc-500">expired</span>}
                </div>
                <p className="text-xs text-zinc-500 mt-1 font-mono break-all">{entry.value}</p>
                <p className="text-sm text-zinc-200 mt-1">{entry.reason}</p>
                {entry.notes && <p className="text-xs text-zinc-400 mt-1">{entry.notes}</p>}
                <p className="text-[11px] text-zinc-500 mt-1">
                  Added {entry.addedAt ? new Date(entry.addedAt).toLocaleString() : '—'} by <span className="font-mono">{entry.addedBy}</span>
                </p>
              </div>
              {entry.active && (
                <button
                  onClick={() => handleExpire(entry.id)}
                  className="text-zinc-400 hover:text-red-300"
                  title="Mark expired"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DnsListManager;
