'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  Flame,
  Home,
  LogOut,
  Menu,
  Phone,
  PhoneIncoming,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import RouteGuard from '../auth/RouteGuard';
import { fetchApi } from '@/lib/api';

type NavItem = [string, any, string];
type NavGroup = { label: string; items: NavItem[] };

const COMPANY_ADMIN_NAV: NavGroup[] = [
  {
    label: 'MAIN',
    items: [
      ['Dashboard', Home, '/dashboard'],
      ['Leads', Users, '/leads'],
      ['Campaigns', Target, '/campaigns'],
      ['Calls', Phone, '/calls'],
      ['Inbound Calls', PhoneIncoming, '/inbound-calls'],
      ['AI Prompt', Bot, '/prompt'],
      ['Agent', Activity, '/agent'],
      ['Voice Intelligence', Activity, '/voice-intelligence'],
      ['Analytics', BarChart3, '/analytics'],
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      ['Team', Users, '/team'],
      ['Billing & Usage', TrendingUp, '/billing'],
      ['Settings', Settings2, '/settings'],
    ],
  },
];

const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    label: 'PLATFORM',
    items: [
      ['Dashboard', Home, '/admin'],
      ['Companies', Building2, '/admin/companies'],
      ['Users', Users, '/admin/users'],
      ['Access Requests', UserCheck, '/admin/access-requests'],
    ],
  },
];

function AccountMenu({ align = 'right' }: { align?: 'right' | 'left' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = user?.name ? user.name.substring(0, 2).toUpperCase() : 'SK';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted"
        aria-label="Account menu"
      >
        <div className="avatar avatar-blue">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{user?.name || 'User'}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user?.email || 'user@voiceai.com'}</p>
        </div>
        <ChevronDown size={15} className="text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 mt-2 w-48 rounded-lg border border-border bg-card p-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0 bottom-full mb-2'}`}>
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{user?.role === 'super_admin' ? 'Super Admin' : 'Company Admin'}</span>
            </div>
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <LogOut size={15} />Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HeaderAvatarMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = user?.name ? user.name.substring(0, 2).toUpperCase() : 'SK';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="avatar avatar-blue ml-1" aria-label="Account menu">
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-border bg-card p-1 shadow-xl">
            <div className="px-3 py-2">
              <p className="truncate text-xs font-semibold">{user?.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <LogOut size={15} />Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    try {
      const data = await fetchApi('/api/v1/notifications?limit=15');
      setNotifications(data?.notifications || []);
      setUnreadCount(data?.unread_count || 0);
    } catch {
      // Silent - notifications are a convenience, not critical path.
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenNotification = async (n: any) => {
    try {
      await fetchApi(`/api/v1/notifications/${n.id}/read`, { method: 'POST' });
    } catch { }
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - (n.read ? 0 : 1)));
    setOpen(false);
    if (n.call_id) router.push(`/leads`);
  };

  const handleMarkAllRead = async () => {
    try {
      await fetchApi('/api/v1/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <span className="text-xs font-bold text-foreground">Lead Alerts</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-[11px] font-semibold text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                No alerts yet - you'll see leads here as soon as they go Qualified or Converted.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3.5 py-3 text-left last:border-0 hover:bg-muted/50 ${!n.read ? 'bg-primary/5' : ''}`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Flame size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-foreground">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompanySelector() {
  const { companyContext, setCompanyContext } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    fetchApi('/api/v1/admin/companies?limit=200')
      .then((r) => setCompanies(r.data || []))
      .catch(() => { });
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-primary/10"
      >
        <ShieldCheck size={14} className="text-primary" />
        Viewing: {companyContext ? companyContext.name : 'All Companies'}
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
            <button
              onClick={() => {
                setCompanyContext(null);
                setOpen(false);
                router.push('/admin');
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
            >
              All Companies
            </button>
            {companies.map((c) => (
              <button
                key={c.company_id}
                onClick={() => {
                  setCompanyContext({ id: c.company_id, name: c.name });
                  setOpen(false);
                  router.push(`/admin/companies/${c.company_id}`);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{c.name}</span>
                {c.status !== 'ACTIVE' && (
                  <span className="text-[10px] font-semibold text-amber-600">{c.status}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchModal({ open, onClose, navGroups }: { open: boolean; onClose: () => void; navGroups: NavGroup[] }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      setQuery('');
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const results = navGroups
    .flatMap((g) => g.items)
    .filter(([label]) => (label as string).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm p-4 pt-[10vh]">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center border-b border-border px-4 py-3">
          <Search size={18} className="text-muted-foreground mr-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={onClose} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">ESC</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            results.map(([label, Icon, href]) => (
              <Link key={href as string} href={href as string} onClick={onClose} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <Icon size={16} className="text-muted-foreground" />
                <span>{label as string}</span>
              </Link>
            ))
          ) : (
            <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ open, onClose, user, navGroups }: { open: boolean; onClose: () => void; user: any; navGroups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <>
      <aside className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-border bg-card lg:static lg:flex`}>
        <div className="flex h-[76px] items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <div className="brand-mark"><Bot size={20} /></div>
            <span className="text-[17px] font-bold tracking-tight">Voice AI</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground lg:hidden" aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-7">
          <p className="eyebrow px-3">{user?.role === 'super_admin' ? 'Platform Admin' : 'Workspace'}</p>
          {navGroups.map((group) => (
            <div key={group.label} className="mt-6">
              <p className="eyebrow px-3">{group.label}</p>
              <nav className="mt-2 space-y-1" aria-label={`${group.label} navigation`}>
                {group.items.map(([label, Icon, href]) => {
                  const isActive = href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href as string);
                  return (
                    <Link key={label as string} href={href as string} onClick={() => onClose()} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-semibold tracking-wide transition-colors ${isActive ? 'bg-accent text-primary' : 'text-foreground/70 hover:bg-muted hover:text-foreground'}`}>
                      <Icon size={18} strokeWidth={2.5} />
                      <span>{label as string}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <AccountMenu align="left" />
        </div>
      </aside>
      {open && <button onClick={onClose} className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" aria-label="Close navigation overlay" />}
    </>
  );
}

export default function AppLayout({ children, title = 'Dashboard' }: { children: React.ReactNode; title?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, isSuperAdmin, companyContext } = useAuth();

  const navGroups = isSuperAdmin ? SUPER_ADMIN_NAV : COMPANY_ADMIN_NAV;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <RouteGuard>
      <div className="flex min-h-screen bg-background">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} user={user} navGroups={navGroups} />
        <div className="min-w-0 flex-1">
          {isSuperAdmin && companyContext && (
            <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-5 py-2 text-xs font-semibold text-primary lg:px-8">
              <ShieldCheck size={14} />
              Super Admin • Viewing {companyContext.name}
            </div>
          )}
          <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-card/95 px-5 backdrop-blur lg:px-8">
            <button onClick={() => setMenuOpen(true)} className="rounded-lg border border-border p-2 text-muted-foreground lg:hidden" aria-label="Open navigation"><Menu size={19} /></button>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-[11px] text-muted-foreground">{isSuperAdmin ? 'Voice AI platform' : 'Voice AI workspace'}</p>
            </div>
            <div className="flex items-center gap-2">
              {isSuperAdmin && <CompanySelector />}
              <button onClick={() => setSearchOpen(true)} className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground sm:flex hover:bg-muted transition-colors">
                <Search size={14} />Search…
              </button>
              {!isSuperAdmin && <NotificationBell />}
              <HeaderAvatarMenu />
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] space-y-6 px-5 py-7 lg:px-8 lg:py-9">{children}</main>
        </div>
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} navGroups={navGroups} />
      </div>
    </RouteGuard>
  );
}
