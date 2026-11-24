import { useState, useEffect, type FormEvent } from 'react';
import {
  Plus, Edit2, Trash2, TrendingUp, Users, DollarSign, Star, X, LogOut,
} from 'lucide-react';
import {
  fetchServices, getAdminStats, getAdminSession, adminLogin, adminLogout,
  createService, updateService, deleteService as deleteServiceAPI, setSalonMode,
} from '../lib/api';
import { socket } from '../lib/socket';
import { Service, AdminStats } from '../lib/types';
import Navbar from '../components/Navbar';

const CATEGORIES = ['Hair', 'Skin', 'Nails', 'Spa'];
const TYPES = ['Quick', 'Standard', 'Premium'];

const CATEGORY_COLORS: Record<string, string> = {
  Hair: 'bg-[#f5e8ef] text-[#9e6684]',
  Skin: 'bg-[#fbefd9] text-[#a07d32]',
  Nails: 'bg-[#eee7f7] text-[#80659e]',
  Spa: 'bg-[#e2f0ea] text-[#5e8b75]',
};

const empty = { name: '', category: 'Hair', price: '', duration: '', description: '', type: 'Standard' };

export default function Admin() {
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [salonMode, setSalonModeState] = useState<'auto' | 'open' | 'closed'>('auto');
  const [salonSaving, setSalonSaving] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    getAdminSession().then((session) => {
      setAuthenticated(Boolean(session.authenticated));
      if (session.authenticated) loadAll();
      else setLoading(false);
    }).catch(() => setLoading(false));

    const onC = (s: Service) =>
      setServices((p) => p.some((item) => item.id === s.id) ? p.map((item) => item.id === s.id ? s : item) : [...p, s]);
    const onU = (s: Service) => setServices((p) => p.map((x) => (x.id === s.id ? s : x)));
    const onD = ({ id }: { id: number }) => setServices((p) => p.filter((x) => x.id !== id));
    const refresh = () => loadStats();

    socket.on('service:created', onC);
    socket.on('service:updated', onU);
    socket.on('service:deleted', onD);
    socket.on('order:new', refresh);
    socket.on('order:updated', refresh);

    return () => {
      socket.off('service:created', onC);
      socket.off('service:updated', onU);
      socket.off('service:deleted', onD);
      socket.off('order:new', refresh);
      socket.off('order:updated', refresh);
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    try {
      await adminLogin(password);
      setPassword('');
      setAuthenticated(true);
      setLoading(true);
      await loadAll();
    } catch (err: any) {
      setAuthError(err.message || 'Could not sign in');
    }
  }

  async function handleLogout() {
    await adminLogout();
    setAuthenticated(false);
    setServices([]);
    setStats(null);
  }

  async function loadAll() {
    try {
      const [s, st, salon] = await Promise.all([
        fetchServices(), getAdminStats(), fetch('/api/salon/status').then((response) => response.json()),
      ]);
      setServices(s);
      setStats(st);
      setSalonModeState(salon.mode || 'auto');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function changeSalonMode(mode: 'auto' | 'open' | 'closed') {
    setSalonSaving(true);
    try {
      const status = await setSalonMode(mode);
      setSalonModeState(status.mode);
    } catch (err: any) {
      alert(err.message || 'Could not update salon status');
    } finally {
      setSalonSaving(false);
    }
  }

  async function loadStats() {
    try {
      setStats(await getAdminStats());
    } catch { /* ignore */ }
  }

  function openAdd() {
    setForm(empty);
    setEditId(null);
    setShowForm(true);
    setFormErr('');
  }

  function openEdit(s: Service) {
    setForm({
      name: s.name,
      category: s.category,
      price: String(s.price),
      duration: String(s.duration),
      description: s.description,
      type: s.type,
    });
    setEditId(s.id);
    setShowForm(true);
    setFormErr('');
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price || !form.duration) {
      setFormErr('Name, price, and duration are required');
      return;
    }
    if (Number(form.price) <= 0 || Number(form.duration) <= 0) {
      setFormErr('Price and duration must be positive numbers');
      return;
    }

    setSaving(true);
    setFormErr('');
    try {
      const data = {
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price),
        duration: Number(form.duration),
        description: form.description.trim(),
        type: form.type,
      };
      if (editId) await updateService(editId, data);
      else await createService(data);
      setShowForm(false);
      setForm(empty);
      setEditId(null);
    } catch (err: any) {
      setFormErr(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
      await deleteServiceAPI(id);
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleAvail(s: Service) {
    try {
      await updateService(s.id, { is_available: s.is_available ? 0 : 1 });
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffdfb]">
        <Navbar />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6b4b8b]" />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#fffdfb] text-[#34263e]">
        <Navbar />
        <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
          <form onSubmit={handleLogin} className="w-full rounded-3xl border border-[#eee6f0] bg-white p-7 shadow-[0_4px_24px_rgba(73,49,87,0.06)] sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9879a3]">Glamour Queue · Staff</p>
            <h1 className="mt-2 font-serif text-3xl font-bold">Admin sign in</h1>
            <p className="mt-2 text-sm text-[#8c7892]">Sign in to manage salon hours and services.</p>
            <label htmlFor="admin-password" className="mt-6 block text-sm font-semibold">Staff password</label>
            <input id="admin-password" type="password" autoComplete="current-password" required value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#e7ddec] px-4 outline-none focus:border-[#9879a3] focus:ring-2 focus:ring-[#9879a3]/20" />
            {authError && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{authError}</p>}
            <button type="submit" className="mt-5 min-h-12 w-full rounded-full bg-[#6b4b8b] px-5 text-sm font-bold text-white hover:bg-[#563872]">Sign in</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffdfb] text-[#34263e]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#9879a3] font-bold">Glamour Queue · Control Room</p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#34263e]">
              Admin & Service Studio
            </h1>
          </div>
          <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-[#e7ddec] px-4 py-2.5 text-xs font-bold text-[#6b4b8b] hover:bg-[#f7f2f9]">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>

        <section className="mb-8 rounded-3xl border border-[#eee6f0] bg-white p-5 shadow-[0_4px_24px_rgba(73,49,87,0.04)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#34263e]">Salon status</h2>
              <p className="mt-1 text-sm text-[#8c7892]">Open or close bookings manually, or return to the regular 9 AM–7:45 PM schedule.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['open', 'Open now'], ['closed', 'Close bookings'], ['auto', 'Use schedule'],
              ] as const).map(([mode, label]) => (
                <button key={mode} disabled={salonSaving} onClick={() => changeSalonMode(mode)}
                  className={`rounded-full px-4 py-2.5 text-xs font-bold transition disabled:opacity-50 ${salonMode === mode ? 'bg-[#6b4b8b] text-white' : 'border border-[#e7ddec] bg-white text-[#6b4b8b] hover:bg-[#f7f2f9]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs font-semibold text-[#765b80]">
            {salonMode === 'auto' ? 'Following regular salon hours.' : salonMode === 'open' ? 'Bookings are manually open.' : 'Bookings are manually closed.'}
          </p>
        </section>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Stat
              icon={<Users className="w-5 h-5 text-sky-700" />}
              wash="bg-sky-50"
              label="Today's Guests"
              value={stats.totalOrders}
            />
            <Stat
              icon={<DollarSign className="w-5 h-5 text-emerald-700" />}
              wash="bg-emerald-50"
              label="Revenue"
              value={`₹${stats.totalRevenue}`}
            />
            <Stat
              icon={<TrendingUp className="w-5 h-5 text-amber-700" />}
              wash="bg-amber-50"
              label="Completed"
              value={stats.servicesCompleted}
            />
            <Stat
              icon={<Star className="w-5 h-5 text-violet-700" />}
              wash="bg-violet-50"
              label="Top Service"
              value={stats.topService || '—'}
              small
            />
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-3xl border border-[#eee6f0] shadow-[0_4px_24px_rgba(73,49,87,0.04)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#f0e8f2] flex flex-wrap items-center justify-between gap-4 bg-[#fbf9fc]">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#34263e]">
                Salon Offerings ({services.length})
              </h2>
              <p className="text-xs text-[#8c7892] mt-0.5">Toggle availability or update pricing & durations in real time.</p>
            </div>
            <button
              onClick={openAdd}
              className="bg-[#6b4b8b] text-white px-5 py-2.5 rounded-full text-xs font-extrabold
                         hover:bg-[#563872] transition flex items-center gap-1.5 shadow-md shadow-violet-100"
            >
              <Plus className="w-4 h-4" /> Add Service
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#faf6fc] text-[11px] font-bold uppercase tracking-wider text-[#8c7892] border-b border-[#f0e8f2]">
                <tr>
                  <th className="px-6 py-3.5">Service Name</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Tier</th>
                  <th className="px-6 py-3.5 text-center">Available</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5edf6]">
                {services.map((s) => (
                  <tr key={s.id} className={`transition ${!s.is_available ? 'bg-rose-50/30' : 'hover:bg-[#faf7fb]'}`}>
                    <td className="px-6 py-4 font-bold text-[#34263e]">{s.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${CATEGORY_COLORS[s.category] || 'bg-gray-100 text-gray-700'}`}>
                        {s.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#6b4b8b]">₹{s.price}</td>
                    <td className="px-6 py-4 text-xs font-medium text-[#766779]">{s.duration} min</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f4eef6] text-[#765b80]">
                        {s.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleAvail(s)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          s.is_available ? 'bg-[#4d826a]' : 'bg-gray-300'
                        }`}
                        title={s.is_available ? 'Click to mark unavailable' : 'Click to make available'}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white transition transform ${
                            s.is_available ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-[#6b4b8b] hover:text-[#563872] p-1.5 rounded-lg hover:bg-[#f4eef6] mr-2 transition"
                        title="Edit service"
                      >
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition"
                        title="Delete service"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[#25172e]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#eee6f0]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#9879a3] font-bold">Catalog Management</p>
                <h3 className="font-serif text-2xl font-bold text-[#34263e]">
                  {editId ? 'Edit Offering' : 'New Offering'}
                </h3>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="text-[#8c7892] hover:text-[#34263e] p-1.5 rounded-full hover:bg-[#f5edf6] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Classic Haircut & Style"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="250"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    placeholder="30"
                    value={form.duration}
                    onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                  Service Tier
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#766779] mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Details regarding products or techniques..."
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-[#fdfbfe] rounded-2xl border border-[#ded4e1] text-sm focus:outline-none focus:ring-2 focus:ring-[#6b4b8b]"
                />
              </div>
            </div>

            {formErr && <p className="text-rose-600 text-xs mt-3 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{formErr}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-[#ded4e1] py-3 rounded-full text-xs font-bold text-[#635367] hover:bg-[#faf7fb] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#6b4b8b] text-white py-3 rounded-full text-xs font-extrabold hover:bg-[#563872] disabled:opacity-50 transition shadow-md shadow-violet-100"
              >
                {saving ? 'Saving…' : 'Save Offering'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, wash, label, value, small }: {
  icon: React.ReactNode; wash: string; label: string;
  value: string | number; small?: boolean;
}) {
  return (
    <div className="bg-white rounded-3xl p-5 border border-[#eee6f0] shadow-[0_4px_20px_rgba(73,49,87,0.04)]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-xl ${wash}`}>{icon}</div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#8c7892]">{label}</span>
      </div>
      <p className={`font-serif font-bold text-[#34263e] ${small ? 'text-lg truncate' : 'text-3xl'}`}>
        {value}
      </p>
    </div>
  );
}
