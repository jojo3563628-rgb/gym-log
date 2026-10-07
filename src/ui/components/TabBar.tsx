import { NavLink } from 'react-router';
import { IconCalendar, IconHistory, IconList, IconSettings, IconToday } from './icons';

const TABS = [
  { to: '/', label: '今天', icon: IconToday, end: true },
  { to: '/calendar', label: '行事曆', icon: IconCalendar, end: false },
  { to: '/exercises', label: '動作庫', icon: IconList, end: false },
  { to: '/history', label: '歷史', icon: IconHistory, end: false },
  { to: '/settings', label: '設定', icon: IconSettings, end: false },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="主選單">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
