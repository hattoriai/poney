/** @jsxRuntime automatic @jsxImportSource react */
import {
  AppWindow,
  BookOpen,
  Box,
  Boxes,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  Globe,
  KeyRound,
  Landmark,
  Library,
  Mail,
  Package,
  Plug,
  Radio,
  Receipt,
  Route,
  Send,
  Server,
  ShoppingCart,
  Store,
  Table2,
  Timer,
  UserCog,
  UserRound,
  Users,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Icons a presentation may name. Kept explicit so the bundle stays small. */
export const ICONS: Record<string, LucideIcon> = {
  'app-window': AppWindow,
  'book-open': BookOpen,
  box: Box,
  boxes: Boxes,
  'clipboard-list': ClipboardList,
  'credit-card': CreditCard,
  database: Database,
  'file-text': FileText,
  globe: Globe,
  'key-round': KeyRound,
  landmark: Landmark,
  library: Library,
  mail: Mail,
  package: Package,
  plug: Plug,
  radio: Radio,
  receipt: Receipt,
  route: Route,
  send: Send,
  server: Server,
  'shopping-cart': ShoppingCart,
  store: Store,
  table: Table2,
  timer: Timer,
  'user-cog': UserCog,
  'user-round': UserRound,
  users: Users,
  waypoints: Waypoints,
  zap: Zap,
}

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Box
}

/** An icon positioned inside SVG. */
export function Glyph({ name, x, y, size = 16, color = 'currentColor', strokeWidth = 1.75 }: { name: string; x: number; y: number; size?: number; color?: string; strokeWidth?: number }) {
  const Icon = iconFor(name)
  return <Icon x={x} y={y} width={size} height={size} color={color} strokeWidth={strokeWidth} aria-hidden />
}
