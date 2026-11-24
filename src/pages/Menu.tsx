import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, Clock3, Heart,
  Search, ShoppingBag, Sparkles, Users,
} from 'lucide-react';
import { fetchServices, getActiveOrders } from '../lib/api';
import { socket } from '../lib/socket';
import { useCart } from '../context/CartContext';
import { Order, Service } from '../lib/types';
import Navbar from '../components/Navbar';
import ServiceCard from '../components/ServiceCard';

const CATEGORIES = ['All', 'Hair', 'Skin', 'Nails', 'Spa'];

export default function Menu() {
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [salonOpen, setSalonOpen] = useState(true);
  const [lastOrderId, setLastOrderId] = useState('');
  const { totalAmount, totalItems } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    const serviceLoad = fetchServices().then(setServices).catch((err) => {
      console.error('Could not load services:', err);
      setLoadError('The menu could not be loaded. Refresh the page and try again.');
    });
    const queueLoad = getActiveOrders().then(setOrders).catch((err) => console.error('Could not load live queue:', err));
    Promise.all([serviceLoad, queueLoad]).finally(() => setLoading(false));
    checkStatus();
    setLastOrderId(localStorage.getItem('glamour-last-order') || '');

    const onUpdated = (s: Service) => setServices((prev) => prev.map((x) => x.id === s.id ? s : x));
    const onCreated = (s: Service) => setServices((prev) => [...prev.filter((x) => x.id !== s.id), s]);
    const onDeleted = ({ id }: { id: number }) => setServices((prev) => prev.filter((x) => x.id !== id));
    const upsertOrder = (order: Order) => setOrders((previous) => previous.some((item) => item.id === order.id)
      ? previous.map((item) => item.id === order.id ? order : item)
      : [...previous, order]);
    const onOrderUpdated = (order: Order) => {
      if (order.status === 'CheckedOut' || order.status === 'Cancelled') setOrders((previous) => previous.filter((item) => item.id !== order.id));
      else upsertOrder(order);
    };
    const onSalonStatus = (status: { isOpen: boolean }) => setSalonOpen(status.isOpen);
    socket.on('service:updated', onUpdated);
    socket.on('service:created', onCreated);
    socket.on('service:deleted', onDeleted);
    socket.on('order:new', upsertOrder);
    socket.on('order:updated', onOrderUpdated);
    socket.on('salon:status', onSalonStatus);
    return () => {
      socket.off('service:updated', onUpdated); socket.off('service:created', onCreated);
      socket.off('service:deleted', onDeleted); socket.off('order:new', upsertOrder);
      socket.off('order:updated', onOrderUpdated);
      socket.off('salon:status', onSalonStatus);
    };
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/salon/status');
      const data = await res.json();
      setSalonOpen(data.isOpen);
    } catch { /* retain the last known status */ }
  }

  const filtered = useMemo(() => services.filter((service) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || service.name.toLowerCase().includes(query) || service.description.toLowerCase().includes(query);
    return matchesSearch && (activeCategory === 'All' || service.category === activeCategory);
  }), [services, searchQuery, activeCategory]);

  const waitingCount = orders.filter((order) => order.status === 'Placed').length;
  const inServiceCount = orders.filter((order) => order.status === 'InProgress').length;
  const availableCount = services.filter((service) => service.is_available).length;

  return (
    <div className="min-h-screen bg-[#fffdfb] pb-28 text-[#34263e]">
      <Navbar />

      <main>
        <section className="relative isolate overflow-hidden bg-[#f4eef6]">
          <div className="pointer-events-none absolute -right-24 -top-28 h-[440px] w-[440px] rounded-full bg-[#e5d5ec] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 left-[32%] h-[360px] w-[360px] rounded-full bg-[#f9e1dd] blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:min-h-[490px] md:grid-cols-[1.1fr_0.9fr] md:py-16 lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#765b80] shadow-sm">
                <span className={`h-2 w-2 rounded-full ${salonOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {salonOpen ? 'Taking walk-ins · Open till 8 PM' : 'Currently closed · Opens at 9 AM'}
              </div>
              <h1 className="mt-6 font-serif text-[2.85rem] font-medium leading-[1.04] tracking-[-0.04em] text-[#34263e] sm:text-6xl lg:text-[4.5rem]">
                A little time<br />for <span className="italic text-[#795b87]">yourself.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#786b7b] sm:text-lg">
                Find your feel-good service, join the live salon queue, and spend less time waiting.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href="#services" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#6b4b8b] px-6 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-[#563872]">
                  Explore the menu <ArrowDown className="h-4 w-4" />
                </a>
                {lastOrderId ? (
                  <button onClick={() => navigate(`/token/${lastOrderId}`)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d9cce0] bg-white/75 px-5 text-sm font-bold text-[#614a6f] transition hover:bg-white">
                    <Clock3 className="h-4 w-4" /> Track my booking <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <a href="#how-it-works" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d9cce0] bg-white/75 px-5 text-sm font-bold text-[#614a6f] transition hover:bg-white">
                    How it works <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-[#796c7d]">
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" /> No account needed</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" /> Live queue updates</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[460px] md:justify-self-end">
              <div className="relative min-h-[330px] overflow-hidden rounded-[2rem] bg-[#3b2c45] p-5 text-white shadow-2xl shadow-violet-200 sm:min-h-[370px] sm:p-7">
                <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/10" />
                <div className="absolute -right-2 top-1 h-44 w-44 rounded-full border border-white/10" />
                <div className="absolute -bottom-16 -left-12 h-52 w-52 rounded-full bg-[#74527d]/50 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d9cae1]">The salon edit</p><p className="mt-2 font-serif text-2xl sm:text-3xl">Your next best hour.</p></div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Sparkles className="h-5 w-5 text-[#f0d99f]" /></span>
                </div>
                <div className="relative mt-8 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-[#d8c9df]"><Users className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wider">Waiting now</span></div>
                    <p className="mt-3 text-4xl font-black">{loading ? '—' : waitingCount}</p>
                    <p className="mt-1 text-xs text-[#c6b7cc]">{waitingCount === 1 ? 'guest in the queue' : 'guests in the queue'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-[#d8c9df]"><Heart className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wider">On the menu</span></div>
                    <p className="mt-3 text-4xl font-black">{loading ? '—' : availableCount}</p>
                    <p className="mt-1 text-xs text-[#c6b7cc]">services to choose from</p>
                  </div>
                </div>
                <div className="relative mt-3 flex items-center justify-between rounded-2xl bg-[#f5eef5] px-4 py-3.5 text-[#46334e]">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-[#937b9a]">Being looked after</p><p className="mt-0.5 text-sm font-bold">{inServiceCount} {inServiceCount === 1 ? 'guest' : 'guests'} in a chair</p></div>
                  <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" /></span>
                </div>
                <p className="relative mt-4 text-center text-xs text-white/50">Queue count refreshes live · No booking fee</p>
              </div>
              <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2.5 text-xs font-bold text-[#6b4b8b] shadow-lg sm:flex">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f4eef6]"><Sparkles className="h-3.5 w-3.5" /></span> A better kind of wait
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9879a3]">A menu made for you</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#34263e] sm:text-4xl">Find your feel-good.</h2>
              <p className="mt-2 text-sm text-[#837987] sm:text-base">Pick a service, add it to your bag, then join the queue.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[#f5f0f6] px-4 py-2.5 text-xs font-semibold text-[#765b80]">
              <Clock3 className="h-4 w-4" /> Open daily · 9 AM to 8 PM
            </div>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-[minmax(230px,1fr)_auto] md:items-center">
            <label className="relative block">
              <span className="sr-only">Search salon services</span>
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a08ea5]" />
              <input
                type="search" placeholder="Search hair, nails, facials…" value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#eee6f0] bg-white pl-12 pr-4 text-sm outline-none transition placeholder:text-[#ae9eaf] focus:border-[#a98aba] focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by service category">
              {CATEGORIES.map((category) => {
                const count = category === 'All' ? services.length : services.filter((service) => service.category === category).length;
                const selected = activeCategory === category;
                return <button key={category} onClick={() => setActiveCategory(category)} aria-pressed={selected} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${selected ? 'bg-[#6b4b8b] text-white shadow-md shadow-violet-200' : 'border border-[#eee6f0] bg-white text-[#776a7b] hover:border-[#d9c8e0] hover:bg-[#faf6fb]'}`}>
                  {category}{!loading && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selected ? 'bg-white/20 text-white' : 'bg-[#f5f0f6] text-[#9c8aa1]'}`}>{count}</span>}
                </button>;
              })}
            </div>
          </div>

          <div className="mb-4 mt-5 flex items-center justify-between text-xs font-medium text-[#9b8e9e]">
            <span>{loading && services.length === 0 ? 'Loading today’s menu…' : searchQuery || activeCategory !== 'All' ? `${filtered.length} matching services` : `${services.length} salon favourites`}</span>
            {loading && <span className="animate-pulse">Refreshing menu…</span>}
          </div>

          {loading && services.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-56 animate-pulse rounded-3xl bg-[#f5f0f6]" />)}</div>
          ) : loadError && services.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#e6dbe9] bg-[#fbf8fc] px-6 py-16 text-center">
              <p className="font-serif text-xl font-semibold">Menu unavailable</p>
              <p className="mt-1 text-sm text-[#897d8d]">{loadError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#e6dbe9] bg-[#fbf8fc] px-6 py-16 text-center">
              <Search className="mx-auto h-8 w-8 text-[#b69fc0]" />
              <p className="mt-3 font-serif text-xl font-semibold">No matches this time</p>
              <p className="mt-1 text-sm text-[#897d8d]">Try a different search or choose another category.</p>
              <button onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#6b4b8b] shadow-sm ring-1 ring-[#e8deeb]">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {filtered.map((service) => <ServiceCard key={service.id} service={service} />)}
            </div>
          )}
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-[#f5f0f6] p-6 sm:p-9 md:p-10">
            <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-center">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9879a3]">Simple from the start</p><h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Your visit, in three easy steps.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-[#7f7383]">No sign-up or appointment date needed. Walk in, join the queue, and follow your turn live.</p></div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { n: '01', title: 'Choose your service', copy: 'Browse the menu and add your favourites.' },
                  { n: '02', title: 'Get your token', copy: 'Enter your name and phone to join today’s line.' },
                  { n: '03', title: 'Follow your turn', copy: 'See your place in the queue update live.' },
                ].map((step) => <article key={step.n} className="rounded-2xl border border-white bg-white p-4 shadow-sm sm:p-5"><p className="text-xs font-black tracking-[0.18em] text-[#b49abd]">{step.n}</p><h3 className="mt-3 text-sm font-extrabold text-[#47374e]">{step.title}</h3><p className="mt-1.5 text-xs leading-5 text-[#887d8c]">{step.copy}</p></article>)}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#eee6f0] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-[#96899a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-serif text-sm font-bold text-[#6b4b8b]">Glamour Queue</span>
          <span>Beautiful services. A clearer queue. Your time back.</span>
          <button onClick={() => navigate('/display')} className="inline-flex items-center gap-1 font-semibold text-[#765b80] hover:text-[#50355e]">View live queue <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </div>
      </footer>

      {totalItems > 0 && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/20 bg-[#34263e]/95 px-4 py-3 text-white shadow-[0_-12px_40px_rgba(52,38,62,0.2)] backdrop-blur-xl sm:py-4">
        <button onClick={() => navigate('/cart')} className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 text-left"><span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><ShoppingBag className="h-5 w-5" /><span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e4bf80] px-1 text-[10px] font-black text-[#34263e]">{totalItems}</span></span><span className="truncate"><span className="block text-sm font-bold">Your salon bag</span><span className="block text-xs text-white/65">{totalItems} {totalItems === 1 ? 'service' : 'services'} · ₹{totalAmount}</span></span></div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-[#50355e] transition hover:bg-[#f7eef8]">Review & book <ArrowRight className="h-4 w-4" /></span>
        </button>
      </div>}
    </div>
  );
}
