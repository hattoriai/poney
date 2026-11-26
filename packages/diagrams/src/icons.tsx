/** @jsxRuntime automatic */
/** @jsxImportSource @hattoriai/poney-diagrams */
import {
  AppWindow,
  Blocks,
  BookOpen,
  Box,
  Boxes,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  GitBranch,
  Globe,
  KeyRound,
  Landmark,
  Library,
  Link2,
  ListOrdered,
  Mail,
  Map as MapNode,
  Minus,
  Network,
  Package,
  Plug,
  Plus,
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
  UsersRound,
  Waypoints,
  Zap,
  type IconNode,
} from 'lucide'

/** A Lucide icon: its name (for the `lucide-<name>` class) and its shapes. */
export interface IconData {
  name: string
  node: IconNode
}
const icon = (name: string, node: IconNode): IconData => ({ name, node })

/** The icons renderers draw, and diagram types use as their symbol. */
export const LUCIDE = {
  blocks: icon('blocks', Blocks),
  chevronsDownUp: icon('chevrons-down-up', ChevronsDownUp),
  chevronsUpDown: icon('chevrons-up-down', ChevronsUpDown),
  circleDot: icon('circle-dot', CircleDot),
  gitBranch: icon('git-branch', GitBranch),
  keyRound: icon('key-round', KeyRound),
  link2: icon('link-2', Link2),
  listOrdered: icon('list-ordered', ListOrdered),
  map: icon('map', MapNode),
  minus: icon('minus', Minus),
  network: icon('network', Network),
  plus: icon('plus', Plus),
  table2: icon('table-2', Table2),
  users: icon('users', Users),
  usersRound: icon('users-round', UsersRound),
  waypoints: icon('waypoints', Waypoints),
}

/** Icons a presentation may name. Kept explicit so the bundle stays small. */
export const ICONS: Record<string, IconData> = {
  'app-window': icon('app-window', AppWindow),
  'book-open': icon('book-open', BookOpen),
  box: icon('box', Box),
  boxes: icon('boxes', Boxes),
  'clipboard-list': icon('clipboard-list', ClipboardList),
  'credit-card': icon('credit-card', CreditCard),
  database: icon('database', Database),
  'file-text': icon('file-text', FileText),
  globe: icon('globe', Globe),
  'key-round': LUCIDE.keyRound,
  landmark: icon('landmark', Landmark),
  library: icon('library', Library),
  mail: icon('mail', Mail),
  package: icon('package', Package),
  plug: icon('plug', Plug),
  radio: icon('radio', Radio),
  receipt: icon('receipt', Receipt),
  route: icon('route', Route),
  send: icon('send', Send),
  server: icon('server', Server),
  'shopping-cart': icon('shopping-cart', ShoppingCart),
  store: icon('store', Store),
  table: LUCIDE.table2,
  timer: icon('timer', Timer),
  'user-cog': icon('user-cog', UserCog),
  'user-round': icon('user-round', UserRound),
  users: LUCIDE.users,
  waypoints: LUCIDE.waypoints,
  zap: icon('zap', Zap),
}

export function iconFor(name: string): IconData {
  return ICONS[name] ?? ICONS.box
}

const a11y = (props: Record<string, unknown>) => Object.keys(props).some((k) => (k.startsWith('aria-') || k === 'role' || k === 'title') && props[k] != null)

/**
 * An icon as SVG, with the attributes Lucide's own components write, so the
 * markup is the same in every host.
 */
export function Icon({
  icon,
  size,
  width,
  height,
  color = 'currentColor',
  strokeWidth = 2,
  className,
  ...rest
}: {
  icon: IconData
  size?: number
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  className?: string
  [attribute: string]: unknown
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size ?? 24}
      height={height ?? size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['lucide', `lucide-${icon.name}`, ...(className ? className.split(/\s+/) : [])].filter(Boolean).join(' ')}
      {...(a11y(rest) ? {} : { 'aria-hidden': 'true' })}
      {...rest}
    >
      {icon.node.map(([tag, attrs]) => {
        const Tag = tag
        return <Tag {...attrs} />
      })}
    </svg>
  )
}

/** An icon positioned inside SVG. */
export function Glyph({ name, x, y, size = 16, color = 'currentColor', strokeWidth = 1.75 }: { name: string; x: number; y: number; size?: number; color?: string; strokeWidth?: number }) {
  return <Icon icon={iconFor(name)} x={x} y={y} width={size} height={size} color={color} strokeWidth={strokeWidth} aria-hidden />
}
