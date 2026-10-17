import type { InputHTMLAttributes, ReactNode } from "react"

const paths: Record<string, string> = {
  home: "M3 12l9-8 9 8M5 10v10h14V10",
  bill: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  box: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  users:
    "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4-4",
  check: "M5 12l5 5L20 7",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  unlock:
    "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4",
  phone:
    "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  trash:
    "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  receipt:
    "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  sparkles:
    "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
  bot: "M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1H3a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7V5.73C10.4 5.39 10 4.74 10 4a2 2 0 012-2z",
  upload: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  fileSpreadsheet:
    "M9 17v-6m3 6v-3m3 3v-4M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  table:
    "M3 10h18M3 14h18M10 3v18M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z",
}
export const Icon = ({
  name,
  className = "size-4",
}: {
  name: string
  className?: string
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d={paths[name]} />
  </svg>
)

export const Card = ({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) => (
  <div className={`rounded-xl border border-stone-200 bg-white ${className}`}>
    {children}
  </div>
)
export const CardHead = ({
  title,
  right,
}: {
  title: string
  right?: ReactNode
}) => (
  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
    <h3 className="text-[13px] font-medium text-stone-900">{title}</h3>
    {right}
  </div>
)
export const Btn = ({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "ghost" | "danger"
  disabled?: boolean
  className?: string
  type?: "button" | "submit" | "reset"
}) => {
  const v = {
    primary: "bg-stone-900 text-white hover:bg-stone-800",
    ghost: "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  )
}
export type Tone = "stone" | "green" | "amber" | "red" | "blue"
export const Badge = ({
  children,
  tone = "stone",
}: {
  children: ReactNode
  tone?: Tone
}) => {
  const t = {
    stone: "bg-stone-100 text-stone-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  }[tone]
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${t}`}
    >
      {children}
    </span>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...p}
    className={`h-8 w-full rounded-md border border-stone-200 bg-white px-2.5 text-[13px] outline-none placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-100 ${p.className ?? ""}`}
  />
)
export const selectCls =
  "h-8 w-full rounded-md border border-stone-200 bg-white px-2 text-[13px] outline-none focus:border-stone-400"
export const Field = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <label className="block space-y-1">
    <span className="text-[12px] text-stone-500">{label}</span>
    {children}
  </label>
)
export const Modal = ({
  title,
  onClose,
  children,
  className = "max-w-md",
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 backdrop-blur-[2px] p-4"
    onClick={onClose}
  >
    <div
      className={`w-full ${className} rounded-xl border border-stone-200 bg-white shadow-xl overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
)
export const Spark = ({
  data,
  height = 120,
  forecast = [],
}: {
  data: number[]
  height?: number
  forecast?: number[]
}) => {
  const all = [...data, ...forecast]
  const max = Math.max(1, ...all),
    w = 600,
    n = all.length
  const x = (i: number) => (i / Math.max(1, n - 1)) * w
  const pt = (v: number, i: number) =>
    `${x(i)},${height - 6 - (v / max) * (height - 16)}`
  const line = data.map(pt).join(" ")
  const fc = forecast.length
    ? [
        pt(data[data.length - 1], data.length - 1),
        ...forecast.map((v, i) => pt(v, data.length + i)),
      ].join(" ")
    : ""
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <polygon
        points={`0,${height} ${line} ${x(data.length - 1)},${height}`}
        fill="#1c1917"
        opacity={0.05}
      />
      <polyline
        points={line}
        fill="none"
        stroke="#1c1917"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      {fc && (
        <polyline
          points={fc}
          fill="none"
          stroke="#d97706"
          strokeWidth={1.75}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
export const PageHead = ({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) => (
  <div className="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 className="text-[20px] font-semibold tracking-tight text-stone-900">
        {title}
      </h1>
      {sub && <p className="mt-0.5 text-[13px] text-stone-500">{sub}</p>}
    </div>
    <div className="flex gap-2">{right}</div>
  </div>
)

export const QuaternLogo = ({
  className = "size-7",
}: {
  className?: string
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 select-none ${className}`}
  >
    {/* Dark rounded container with subtle border */}
    <rect width="32" height="32" rx="7.5" fill="#18181b" />
    <rect
      x="0.5"
      y="0.5"
      width="31"
      height="31"
      rx="7"
      stroke="#27272a"
      strokeWidth="1"
    />

    {/* 4 Quadrants forming the stylized monogram 'Q' */}
    {/* Quadrant 1 (North-West Arc) */}
    <path
      d="M15 7.5 C10.858 7.5 7.5 10.858 7.5 15"
      stroke="#f59e0b"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Quadrant 2 (North-East Arc) */}
    <path
      d="M17 7.5 C21.142 7.5 24.5 10.858 24.5 15"
      stroke="#f59e0b"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Quadrant 3 (South-West Arc) */}
    <path
      d="M7.5 17 C7.5 21.142 10.858 24.5 15 24.5"
      stroke="#f59e0b"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Quadrant 4 (South-East Arc) */}
    <path
      d="M17 24.5 C19.5 24.5 21.7 23.2 23 21.2"
      stroke="#f59e0b"
      strokeWidth="2.5"
      strokeLinecap="round"
    />

    {/* The Q's dynamic angled terminal spark (Gold/Amber) */}
    <path
      d="M17.5 17.5 L24.5 24.5"
      stroke="#fde047"
      strokeWidth="2.75"
      strokeLinecap="round"
    />

    {/* Center quadrant alignment pip */}
    <circle cx="16" cy="16" r="1.25" fill="#fde047" />
  </svg>
)

export const QuarternLogo = QuaternLogo
