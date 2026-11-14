'use client';

import '@fontsource-variable/inter';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-500.css';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Bot,
  BarChart3,
  Building2,
  ChevronsUpDown,
  Flame,
  Headset,
  AudioLines,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneIncoming,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Users,
  UsersRound,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import RouteGuard from '../auth/RouteGuard';
import { fetchApi } from '@/lib/api';
import { parseApiDate } from '@/lib/format';

type NavItem = [string, any, string];
type NavGroup = { label: string; items: NavItem[] };

const COMPANY_ADMIN_NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [
      ['Dashboard', LayoutDashboard, '/dashboard'],
      ['Leads', Users, '/leads'],
      ['Campaigns', Target, '/campaigns'],
      ['Calls', Phone, '/calls'],
      ['Inbound Calls', PhoneIncoming, '/inbound-calls'],
      ['AI Prompt', Bot, '/prompt'],
      ['Agent', Headset, '/agent'],
      ['Voice Intelligence', AudioLines, '/voice-intelligence'],
      ['Analytics', BarChart3, '/analytics'],
    ],
  },
  {
    label: 'Management',
    items: [
      ['Team', UsersRound, '/team'],
      ['Billing & Usage', Wallet, '/billing'],
      ['Settings', Settings2, '/settings'],
    ],
  },
];

const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      ['Dashboard', LayoutDashboard, '/admin'],
      ['Companies', Building2, '/admin/companies'],
      ['Users', Users, '/admin/users'],
      ['Access Requests', UserCheck, '/admin/access-requests'],
    ],
  },
];

const COLLAPSE_KEY = 'ds_sidebar_collapsed';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function initialsOf(name?: string | null) {
  const clean = (name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}

function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-ds-primary-soft text-xs font-medium text-ds-primary"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Click-outside + Escape dismissable panel anchored to a `relative` parent. */
function Popover({
  open,
  onClose,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus into the panel, and give it back to the trigger when the panel closes.
    const active = document.activeElement as HTMLElement | null;
    // Some browsers do not focus a button on click, so fall back to the trigger that sits next to the panel.
    const trigger = panelRef.current?.parentElement?.querySelector<HTMLElement>(':scope > button') ?? null;
    const previous = active && active !== document.body ? active : trigger;
    panelRef.current?.querySelector<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        onBlur={(e) => {
          // Tabbing out of the panel closes it (it is a disclosure, not a modal).
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) onClose();
        }}
        className={cx(
          'absolute z-50 rounded-lg border border-ds-line bg-ds-bg shadow-ds-pop',
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ds-error-ink hover:bg-ds-error-soft"
    >
      <LogOut size={15} strokeWidth={1.75} />
      Log out
    </button>
  );
}

function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-ds-surface',
          collapsed && 'lg:justify-center lg:px-0',
        )}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar name={user?.name} />
        <span className={cx('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <span className="block truncate text-[15px] font-medium text-ds-ink">{user?.name || 'User'}</span>
          <span className="block truncate text-[13px] text-ds-ink-3">{user?.email || ''}</span>
        </span>
        <ChevronsUpDown size={14} className={cx('shrink-0 text-ds-ink-3', collapsed && 'lg:hidden')} />
      </button>
      <Popover open={open} onClose={close} className="bottom-full left-0 mb-2 w-56 p-1">
        <div className="px-2.5 py-2 text-xs text-ds-ink-3">
          Signed in as{' '}
          <span className="font-medium text-ds-ink">
            {user?.role === 'super_admin' ? 'Super Admin' : 'Company Admin'}
          </span>
        </div>
        <div className="my-1 border-t border-ds-line" />
        <LogoutButton
          onClick={() => {
            setOpen(false);
            logout();
          }}
        />
      </Popover>
    </div>
  );
}

function HeaderAvatarMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ds-surface"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar name={user?.name} />
      </button>
      <Popover open={open} onClose={close} className="right-0 mt-2 w-56 p-1">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13px] font-medium text-ds-ink">{user?.name}</p>
          <p className="truncate text-xs text-ds-ink-3">{user?.email}</p>
        </div>
        <div className="my-1 border-t border-ds-line" />
        <LogoutButton
          onClick={() => {
            setOpen(false);
            logout();
          }}
        />
      </Popover>
    </div>
  );
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const when = parseApiDate(iso);
  if (!when) return '';
  const diffMs = Date.now() - when.getTime();
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
  const close = useCallback(() => setOpen(false), []);

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
    } catch {}
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
    } catch {}
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={17} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ds-error px-1 text-[10px] font-medium leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <Popover open={open} onClose={close} className="right-0 mt-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-ds-line px-3.5 py-2.5">
          <span className="text-[13px] font-medium text-ds-ink">Lead alerts</span>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="text-xs font-medium text-ds-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-ds-ink-3">
            No alerts yet. Leads appear here as soon as they go Qualified or Converted.
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleOpenNotification(n)}
              className={cx(
                'flex w-full items-start gap-2.5 border-b border-ds-line px-3.5 py-3 text-left last:border-0 hover:bg-ds-surface',
                !n.read && 'bg-ds-primary-soft/50',
              )}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ds-warning-soft text-ds-warning-ink">
                <Flame size={14} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ds-ink">{n.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-ds-ink-2">{n.message}</span>
                <span className="mt-1 block text-xs text-ds-ink-3">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ds-primary" />}
            </button>
          ))
        )}
      </Popover>
    </div>
  );
}

function CompanySelector() {
  const { companyContext, setCompanyContext } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    fetchApi('/api/v1/admin/companies?limit=200')
      .then((r) => setCompanies(r.data || []))
      .catch(() => setLoadFailed(true));
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg border border-ds-line bg-ds-bg px-3 text-sm font-medium text-ds-ink hover:bg-ds-surface"
        aria-expanded={open}
        aria-label={`Viewing: ${companyContext ? companyContext.name : 'All companies'}. Switch company`}
      >
        <ShieldCheck size={15} strokeWidth={1.75} className="text-ds-accent" />
        <span className="hidden max-w-40 truncate sm:inline">
          Viewing: {companyContext ? companyContext.name : 'All companies'}
        </span>
        <ChevronsUpDown size={13} className="text-ds-ink-3" />
      </button>
      <Popover open={open} onClose={close} className="right-0 mt-2 max-h-[60vh] w-64 overflow-y-auto p-1">
        <button
          onClick={() => {
            setCompanyContext(null);
            setOpen(false);
            router.push('/admin');
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ds-ink hover:bg-ds-surface"
        >
          All companies
        </button>
        {loadFailed && (
          <p role="alert" className="px-2.5 py-2 text-xs text-ds-warning-ink">
            Couldn’t load the company list. Reload the page to try again.
          </p>
        )}
        {companies.map((c) => (
          <button
            key={c.company_id}
            onClick={() => {
              setCompanyContext({ id: c.company_id, name: c.name });
              setOpen(false);
              router.push(`/admin/companies/${c.company_id}`);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ds-ink hover:bg-ds-surface"
          >
            <span className="truncate">{c.name}</span>
            {c.status !== 'ACTIVE' && (
              <span className="rounded-full bg-ds-warning-soft px-2 py-0.5 text-[11px] font-medium text-ds-warning-ink">
                {c.status}
              </span>
            )}
          </button>
        ))}
      </Popover>
    </div>
  );
}

function SearchModal({ open, onClose, navGroups }: { open: boolean; onClose: () => void; navGroups: NavGroup[] }) {
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    // Remember where focus was before moving it into the dialog (an `autoFocus` attribute would
    // have moved it first), so it can be handed back on close.
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep Tab inside the dialog while it is open.
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('input, button, a[href]'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const results = navGroups
    .flatMap((g) => g.items)
    .filter(([label]) => (label as string).toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ds-ink/30 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div ref={panelRef} className="relative w-full max-w-lg overflow-hidden rounded-xl border border-ds-line bg-ds-bg shadow-ds-pop">
        <div className="flex items-center gap-3 border-b border-ds-line px-4 py-3">
          <Search size={17} strokeWidth={1.75} className="text-ds-ink-3" />
          <input
            ref={inputRef}
            aria-label="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            className="flex-1 bg-transparent text-sm text-ds-ink outline-none placeholder:text-ds-ink-3"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="rounded border border-ds-line px-1.5 py-0.5 text-[11px] text-ds-ink-3 hover:bg-ds-surface"
          >
            Esc
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            results.map(([label, Icon, href]) => (
              <Link
                key={href as string}
                href={href as string}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ds-ink hover:bg-ds-surface"
              >
                <Icon size={16} strokeWidth={1.75} className="text-ds-ink-3" />
                <span>{label as string}</span>
              </Link>
            ))
          ) : (
            <p className="p-4 text-center text-sm text-ds-ink-3">No results found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  open,
  collapsed,
  onClose,
  onToggleCollapse,
  user,
  navGroups,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  user: any;
  navGroups: NavGroup[];
}) {
  const pathname = usePathname();

  return (
    <>
      <aside
        id="primary-sidebar"
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-ds-line bg-ds-bg transition-transform duration-200',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:self-start lg:transition-[width]',
          open ? 'translate-x-0' : '-translate-x-full max-lg:invisible',
          collapsed ? 'lg:w-[72px]' : 'lg:w-[240px]',
        )}
        aria-label="Primary"
      >
        <div className={cx('flex h-14 shrink-0 items-center justify-between border-b border-ds-line px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <Link href={user?.role === 'super_admin' ? '/admin' : '/dashboard'} className="flex items-center gap-2.5" aria-label="TalklyAI home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ds-primary text-white">
              <Bot size={18} strokeWidth={1.75} />
            </span>
            <span className={cx('text-[18px] font-semibold tracking-tight text-ds-ink', collapsed && 'lg:hidden')}>TalklyAI</span>
          </Link>
          <button onClick={onClose} className="rounded-lg p-2 text-ds-ink-3 hover:bg-ds-surface lg:hidden" aria-label="Close navigation">
            <X size={17} />
          </button>
        </div>

        <div className="ds-scroll flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-5' : ''}>
              <p className={cx('px-2.5 pb-2 text-xs font-semibold uppercase tracking-wider text-ds-ink-3', collapsed && 'lg:hidden')}>
                {group.label}
              </p>
              {collapsed && gi > 0 && <div className="mx-2 mb-3 hidden border-t border-ds-line lg:block" />}
              <nav className="space-y-0.5" aria-label={`${group.label} navigation`}>
                {group.items.map(([label, Icon, href]) => {
                  const isActive = href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href as string);
                  return (
                    <Link
                      key={label as string}
                      href={href as string}
                      onClick={() => onClose()}
                      title={collapsed ? (label as string) : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cx(
                        'flex h-10 items-center gap-3 rounded-lg px-2.5 text-base font-medium transition-colors',
                        collapsed && 'lg:justify-center lg:px-0',
                        isActive
                          ? 'bg-ds-primary-soft text-ds-primary'
                          : 'text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink',
                      )}
                    >
                      <Icon size={19} strokeWidth={1.75} className="shrink-0" />
                      <span className={cx('truncate', collapsed && 'lg:sr-only')}>{label as string}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Collapse control: desktop only, aligned with the navigation rows and sitting directly above the account menu */}
        <div className="hidden shrink-0 px-3 pb-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : undefined}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar' : undefined}
            className={cx(
              'flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-base font-medium text-ds-ink-2 transition-colors hover:bg-ds-surface hover:text-ds-ink',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen size={19} strokeWidth={1.75} className="shrink-0" /> : <PanelLeftClose size={19} strokeWidth={1.75} className="shrink-0" />}
            {!collapsed && <span className="truncate">Collapse sidebar</span>}
          </button>
        </div>

        <div className="shrink-0 border-t border-ds-line p-3">
          <AccountMenu collapsed={collapsed} />
        </div>
      </aside>
      {open && (
        <button onClick={onClose} className="fixed inset-0 z-30 bg-ds-ink/30 lg:hidden" aria-label="Close navigation overlay" />
      )}
    </>
  );
}

export default function AppLayout({ children, title = 'Dashboard' }: { children: ReactNode; title?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const { user, isSuperAdmin, companyContext } = useAuth();
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navGroups = isSuperAdmin ? SUPER_ADMIN_NAV : COMPANY_ADMIN_NAV;
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Each page gets its own browser-tab / screen-reader title instead of the site-wide default.
  // Next.js re-asserts its own <title> after the page mounts, so keep ours in place while this page is shown.
  useEffect(() => {
    if (!title) return;
    const wanted = title + ' · TalklyAI';
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  // Mobile navigation drawer: Escape closes it, Tab stays inside it, and focus returns to the menu button.
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = () => document.getElementById('primary-sidebar');
    drawer()?.querySelector<HTMLElement>('button[aria-label="Close navigation"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(drawer()?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {}
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

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
      <div className="ds-app flex min-h-screen">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-ds-bg px-3 py-2 text-sm font-medium text-ds-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:shadow-ds-pop"
        >
          Skip to content
        </a>
        <Sidebar open={menuOpen} collapsed={collapsed} onClose={closeMenu} onToggleCollapse={toggleCollapsed} user={user} navGroups={navGroups} />
        <div className="flex min-w-0 flex-1 flex-col">
          {isSuperAdmin && companyContext && (
            <div role="region" aria-label="Super admin context" className="flex items-center gap-2 border-b border-ds-line bg-ds-accent-soft px-4 py-2 text-xs font-medium text-ds-accent sm:px-6 lg:px-8">
              <ShieldCheck size={14} strokeWidth={1.75} />
              Super Admin · Viewing {companyContext.name}
            </div>
          )}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ds-line bg-ds-bg/90 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={menuButtonRef}
                onClick={() => setMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 hover:bg-ds-surface lg:hidden"
                aria-label="Open navigation"
                aria-expanded={menuOpen}
                aria-controls="primary-sidebar"
              >
                <Menu size={19} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isSuperAdmin && <CompanySelector />}
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-ds-line bg-ds-surface px-3 text-sm text-ds-ink-3 hover:border-ds-line-strong sm:flex"
                aria-keyshortcuts="Control+K Meta+K"
              >
                <Search size={14} strokeWidth={1.75} />
                <span className="flex-1 text-left">Search</span>
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-ink-2 hover:bg-ds-surface sm:hidden"
                aria-label="Search"
              >
                <Search size={17} strokeWidth={1.75} />
              </button>
              {!isSuperAdmin && <NotificationBell />}
              <HeaderAvatarMenu />
            </div>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1320px] flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
        <SearchModal open={searchOpen} onClose={closeSearch} navGroups={navGroups} />
      </div>
    </RouteGuard>
  );
}
