import { useEffect, useRef, useState } from 'react'
import { BOARD } from '../game/board'
import type { ChanceVariant, GameEvent, GameState, MoneyAnchor, Space } from '../game/types'

interface Props {
  state: GameState
  highlight: number | null
  onSpaceClick?: (index: number) => void
  onAnimatingChange?: (busy: boolean) => void // true during a long teleport sequence
  onInfo?: () => void // open the "why a public treasury" dialog
}

// where the face-down Chance deck sits, and where a drawn card settles (board %).
// Deck sits horizontally in the center of the "Miscellaneous" panel.
const PILE = { x: 46.3, y: 44 }
// Card settles in the upper-Miscellaneous half, clearly above the Bank/Treasury
// panel. Held upright so "Chance" stays horizontal and readable.
const CARD_AT = { x: 50, y: 38 }

// dice sit on the Miscellaneous panel
const DICE_AT = { x: 50, y: 35.7 }

// LVT dividend — a slow, glorious shower of bills
const DIVIDEND_STAGGER = 200
const DIVIDEND_FLIGHT = 1.45
const DIVIDEND_HOLD = 350

// timings for the "hauled away" teleport sequence (jail / advance-to-start)
const TELE_JITTER = 2000
const TELE_ARC = 3000
const TELE_LAND = 1000
const TELE_TOTAL = TELE_JITTER + TELE_ARC + TELE_LAND

function centerOf(idx: number) {
  const b = BOARD[idx].box
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}
function easeInOut(p: number) {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
}
// landing squash: shrink → grow → grow → normal
function landScale(p: number) {
  const keys: Array<[number, number]> = [
    [0, 1],
    [0.22, 0.55],
    [0.48, 1.3],
    [0.74, 1.45],
    [1, 1],
  ]
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, s0] = keys[i - 1]
      const [p1, s1] = keys[i]
      return s0 + (s1 - s0) * ((p - p0) / (p1 - p0))
    }
  }
  return 1
}

const GUTTER = 4.5 // percent reserved around the image for marker tabs (keep tight — the board is the star)
const TAB = 3.8 // marker tab thickness, percent of the image
const STEP = 165 // ms per square while a token hops

// festive denominations → colours for flying money
const DENOMS: Array<[number, string]> = [
  [100, '#2f8f5b'],
  [50, '#e7c14a'],
  [10, '#d8c39c'],
  [5, '#c0392b'],
  [1, '#f1e8d0'],
]
function billColors(amount: number): string[] {
  const out: string[] = []
  let rem = amount
  for (const [v, c] of DENOMS) {
    while (rem >= v && out.length < 5) {
      out.push(c)
      rem -= v
    }
  }
  if (!out.length) out.push('#d8c39c')
  return out
}

// full denomination breakdown for the central treasury tally
function breakdown(amount: number): Array<{ value: number; color: string; count: number }> {
  const out: Array<{ value: number; color: string; count: number }> = []
  let rem = amount
  for (const [v, c] of DENOMS) {
    const count = Math.floor(rem / v)
    if (count > 0) {
      out.push({ value: v, color: c, count })
      rem -= count * v
    }
  }
  return out
}

const CHANCE_ACCENT: Record<ChanceVariant, { bar: string; label: string }> = {
  jail: { bar: '#4a4a4a', label: 'Misfortune' },
  move: { bar: '#2f6fb0', label: 'On the Move' },
  gain: { bar: '#2f8f5b', label: 'Good Fortune' },
  pay: { bar: '#c0392b', label: 'Pay Up' },
  lots: { bar: '#d4a017', label: 'On the Land' },
}

function tokenOffset(n: number, count: number): { dx: number; dy: number } {
  if (count <= 1) return { dx: 0, dy: 0 }
  const spread = 9
  const cols = Math.ceil(Math.sqrt(count))
  return {
    dx: ((n % cols) - (cols - 1) / 2) * spread,
    dy: (Math.floor(n / cols) - (Math.ceil(count / cols) - 1) / 2) * spread,
  }
}

type Edge = 'top' | 'bottom' | 'left' | 'right'
function edgeOf(sp: Space): Edge {
  const { x, y, h } = sp.box
  if (y < 6) return 'top'
  if (y + h > 94) return 'bottom'
  if (x < 6) return 'left'
  return 'right'
}

interface Marker {
  kind: 'own' | 'buy' | 'pay'
  color: string
  textColor: string
  text: string
  pulse: boolean
  alert?: boolean
}

function markerFor(state: GameState, idx: number, curArrived: boolean): Marker | null {
  const sp = BOARD[idx]
  if (sp.type !== 'property' && sp.type !== 'railroad' && sp.type !== 'utility') return null
  const st = state.spaces[idx]
  const me = state.players[state.current]
  const onIt = me && !me.bankrupt && me.pos === idx
  // PAY appears only once you've arrived, and only on a *different* owner's lot
  if (onIt && curArrived && st.ownerId != null && st.ownerId !== me.id) {
    const o = state.players[st.ownerId]
    return { kind: 'pay', color: o.color, textColor: '#fff', text: 'PAY', pulse: true, alert: true }
  }
  if (st.ownerId != null) {
    const o = state.players[st.ownerId]
    return {
      kind: 'own',
      color: o.color,
      textColor: '#fff',
      text: o.name.slice(0, 1).toUpperCase(),
      pulse: false,
    }
  }
  return null
}

function tabStyle(sp: Space, edge: Edge): React.CSSProperties {
  const { x, y, w, h } = sp.box
  const base: React.CSSProperties = { position: 'absolute', borderRadius: 3 }
  switch (edge) {
    case 'bottom':
      return { ...base, left: `${x}%`, width: `${w}%`, top: `${y + h - 0.5}%`, height: `${TAB}%` }
    case 'top':
      return { ...base, left: `${x}%`, width: `${w}%`, top: `${y - TAB + 0.5}%`, height: `${TAB}%` }
    case 'left':
      return { ...base, top: `${y}%`, height: `${h}%`, left: `${x - TAB + 0.5}%`, width: `${TAB}%` }
    case 'right':
      return { ...base, top: `${y}%`, height: `${h}%`, left: `${x + w - 0.5}%`, width: `${TAB}%` }
  }
}

interface Bill {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  color: string
  delay: number
  rot: number
  slow?: boolean
  dancePlayerId?: number
}

export function Board({ state, highlight, onSpaceClick, onAnimatingChange, onInfo }: Props) {
  const [display, setDisplay] = useState<Record<number, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.pos])),
  )
  const [bills, setBills] = useState<Bill[]>([])
  const [buyFlash, setBuyFlash] = useState<number[]>([])
  const [teleport, setTeleport] = useState<{ id: number; toIdx: number } | null>(null)
  const [chanceCard, setChanceCard] = useState<{ text: string; variant: ChanceVariant } | null>(
    null,
  )
  const [lotHi, setLotHi] = useState<number | null>(null) // highlight a player's lots
  // dice tumbling on the Miscellaneous panel of the board (during a roll)
  const [rollAnim, setRollAnim] = useState<{
    d1: number
    d2: number
    settled: boolean
    playerId: number
  } | null>(null)
  const [dancing, setDancing] = useState<Record<number, boolean>>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const billId = useRef(1)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  // ---- the choreographer: replay this action's event script as a timeline ----
  useEffect(() => {
    const events = state.events
    if (!events.length) return // empty script: never interrupt an in-flight animation
    timers.current.forEach(clearTimeout)
    timers.current = []

    const evArr = events as GameEvent[]

    // Cancelling the previous script's timers above can strand its transient UI:
    // a token mid-hop freezes short of its square, and a "BUY" stamp's removal
    // never fires. Reconcile against authoritative state before scheduling this
    // script. Snap every token this script will NOT itself animate to its true
    // position, and drop any stale buy-stamp (this script's own buy events
    // re-stamp below). This keeps the buying token on the spot it is buying and
    // prevents the BUY marker from outliving the purchase it announces.
    const movingThisScript = new Set(
      evArr
        .filter((e): e is Extract<GameEvent, { kind: 'move' }> => e.kind === 'move')
        .map((e) => e.playerId),
    )
    setDisplay((d) => {
      const next = { ...d }
      for (const pl of state.players) {
        if (!movingThisScript.has(pl.id)) next[pl.id] = pl.pos
      }
      return next
    })
    setBuyFlash([])

    const anchorXY = (a: MoneyAnchor): { x: number; y: number } => {
      if (a.kind === 'center') return { x: 50, y: 50 }
      const sp = BOARD[state.players[a.id].pos]
      return { x: sp.box.x + sp.box.w / 2, y: sp.box.y + sp.box.h / 2 }
    }
    const spawnBillsXY = (
      A: { x: number; y: number },
      B: { x: number; y: number },
      colors: string[],
      opts?: { baseDelay?: number; slow?: boolean; dancePlayerId?: number },
    ) => {
      const baseDelay = opts?.baseDelay ?? 0
      setBills((bs) => [
        ...bs,
        ...colors.map((c, i) => ({
          id: billId.current++,
          x0: A.x,
          y0: A.y,
          x1: B.x,
          y1: B.y,
          color: c,
          delay: baseDelay + i * (opts?.slow ? DIVIDEND_STAGGER : 95),
          rot: Math.round(Math.random() * 44 - 22),
          slow: opts?.slow,
          dancePlayerId: i === colors.length - 1 ? opts?.dancePlayerId : undefined,
        })),
      ])
    }
    const spawnBills = (
      amount: number,
      from: MoneyAnchor,
      to: MoneyAnchor,
      opts?: { slow?: boolean; dancePlayerId?: number },
    ) => {
      const dancePlayerId = opts?.dancePlayerId ?? (to.kind === 'player' ? to.id : undefined)
      spawnBillsXY(anchorXY(from), anchorXY(to), billColors(amount), {
        slow: opts?.slow,
        dancePlayerId: opts?.slow ? dancePlayerId : undefined,
      })
    }
    const flashBuy = (space: number) => {
      setBuyFlash((b) => (b.includes(space) ? b : [...b, space]))
      timers.current.push(
        setTimeout(() => setBuyFlash((b) => b.filter((s) => s !== space)), 2000),
      )
    }

    // the "hauled away" sequence: shiver (grows) → arc → squash-settle
    const runTeleport = (pid: number, fromIdx: number, toIdx: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const from = centerOf(fromIdx)
      const to = centerOf(toIdx)
      // arc apex pulled toward board centre and lifted up
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const cx = mx + (50 - mx) * 0.45
      const cy = my + (50 - my) * 0.45 - 22
      setTeleport({ id: pid, toIdx })
      const start = performance.now()
      const tick = (now: number) => {
        const el = overlayRef.current
        if (!el) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        const e = now - start
        let x: number
        let y: number
        let s = 1
        let rot = 0
        if (e < TELE_JITTER) {
          // shivering that grows in amplitude
          const amp = 1.5 * (e / TELE_JITTER)
          x = from.x + (Math.random() * 2 - 1) * amp
          y = from.y + (Math.random() * 2 - 1) * amp
          s = 1 + 0.07 * (e / TELE_JITTER)
        } else if (e < TELE_JITTER + TELE_ARC) {
          // slow arcing flight along a quadratic bézier
          const p = easeInOut((e - TELE_JITTER) / TELE_ARC)
          const u = 1 - p
          x = u * u * from.x + 2 * u * p * cx + p * p * to.x
          y = u * u * from.y + 2 * u * p * cy + p * p * to.y
          s = 1.07 - 0.13 * Math.sin(p * Math.PI)
          rot = p * 340
        } else if (e < TELE_TOTAL) {
          // squash-settle at the destination
          x = to.x
          y = to.y
          s = landScale((e - TELE_JITTER - TELE_ARC) / TELE_LAND)
        } else {
          setDisplay((d) => ({ ...d, [pid]: toIdx }))
          setTeleport(null)
          rafRef.current = null
          return
        }
        el.style.left = `${x}%`
        el.style.top = `${y}%`
        el.style.transform = `translate(-50%, -50%) scale(${s}) rotate(${rot}deg)`
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    // long sequences (teleport flight, chance card) pause autonomous play.
    // Reconcile the flag on EVERY script so it can never get stuck "true".
    const hasLong =
      evArr.some((e) => e.kind === 'chance' || (e.kind === 'move' && e.teleport)) ||
      evArr.some((e) => e.kind === 'money' && e.dividend)
    onAnimatingChange?.(hasLong)

    const lastPos: Record<number, number> = {}
    let t = 0
    for (const e of evArr) {
      if (e.kind === 'roll') {
        // ★ dice tumble on the Miscellaneous panel for ~250ms, settle on the
        //   real values, then LINGER visibly until the player has moved the
        //   full count. Then disappear.
        const dice = e.dice
        const startAt = t
        const idx = evArr.indexOf(e)
        const nextMove = evArr.slice(idx + 1).find((x) => x.kind === 'move') as
          | Extract<GameEvent, { kind: 'move' }>
          | undefined
        const rollPlayerId = nextMove?.playerId ?? state.current
        // start the tumble with random faces
        timers.current.push(
          setTimeout(
            () => setRollAnim({ d1: 1, d2: 1, settled: false, playerId: rollPlayerId }),
            startAt,
          ),
        )
        // flick through random faces every 50ms during the tumble (snappy)
        for (let k = 1; k <= 5; k++) {
          timers.current.push(
            setTimeout(
              () =>
                setRollAnim({
                  d1: 1 + Math.floor(Math.random() * 6),
                  d2: 1 + Math.floor(Math.random() * 6),
                  settled: false,
                  playerId: rollPlayerId,
                }),
              startAt + k * 50,
            ),
          )
        }
        // settle on the rolled values
        timers.current.push(
          setTimeout(
            () =>
              setRollAnim({ d1: dice[0], d2: dice[1], settled: true, playerId: rollPlayerId }),
            startAt + 250,
          ),
        )
        // movement starts at 400ms (gives ~150ms hold of the settled face)
        t += 400
        // schedule the dice to disappear AFTER the player has finished moving
        let clearAt = startAt + 400 + 350 // fallback: a short hold if no move follows
        if (nextMove) {
          clearAt = nextMove.teleport
            ? startAt + 400 + TELE_TOTAL + 200
            : startAt + 400 + nextMove.path.length * STEP + 220
        }
        timers.current.push(setTimeout(() => setRollAnim(null), clearAt))
      } else if (e.kind === 'chance') {
        const card = { text: e.text, variant: e.variant }
        const pid = e.playerId
        const startAt = t
        timers.current.push(
          setTimeout(() => {
            setChanceCard(card)
            if (card.variant === 'lots') setLotHi(pid)
          }, startAt),
        )
        timers.current.push(
          setTimeout(() => {
            setChanceCard(null)
            setLotHi(null)
          }, startAt + 4200),
        )
        // ★ "On the Land" cards are the star: money visibly flows between every
        // parcel the player owns and the common Public Treasury at the centre.
        if (e.variant === 'lots') {
          const after = evArr.slice(evArr.indexOf(e) + 1)
          const moneyEvt = after.find((x) => x.kind === 'money') as
            | Extract<GameEvent, { kind: 'money' }>
            | undefined
          const toCentre = moneyEvt ? moneyEvt.to.kind === 'center' : true
          const lots = BOARD.filter((sp) => state.spaces[sp.index].ownerId === pid).map(
            (sp) => sp.index,
          )
          const centre = { x: 50, y: 50 }
          lots.forEach((idx, k) => {
            const at = startAt + 1000 + k * 150
            timers.current.push(
              setTimeout(() => {
                const c = centerOf(idx)
                // a couple of bills per parcel, rising to (or falling from) the Treasury
                if (toCentre) spawnBillsXY(c, centre, ['#c0392b', '#d8c39c'])
                else spawnBillsXY(centre, c, ['#2f8f5b', '#e7c14a'])
              }, at),
            )
          })
        }
        t += 4400
      } else if (e.kind === 'move') {
        const pid = e.playerId
        if (e.teleport) {
          const fromIdx = lastPos[pid] ?? display[pid] ?? state.players[pid].pos
          const toIdx = e.path[0]
          lastPos[pid] = toIdx
          const startAt = t
          timers.current.push(setTimeout(() => runTeleport(pid, fromIdx, toIdx), startAt))
          t += TELE_TOTAL + 200
        } else {
          e.path.forEach((idx, k) => {
            const tt = t + (k + 1) * STEP
            timers.current.push(setTimeout(() => setDisplay((d) => ({ ...d, [pid]: idx })), tt))
          })
          lastPos[pid] = e.path[e.path.length - 1]
          t += e.path.length * STEP + 160
        }
      } else if (e.kind === 'money') {
        const tt = t + 150
        const { amount, from, to, dividend } = e
        if (dividend && to.kind === 'player') {
          const colors = billColors(amount)
          timers.current.push(
            setTimeout(
              () => spawnBills(amount, from, to, { slow: true, dancePlayerId: to.id }),
              tt,
            ),
          )
          t += colors.length * DIVIDEND_STAGGER + DIVIDEND_FLIGHT * 1000 + DIVIDEND_HOLD + 1200
        } else {
          timers.current.push(setTimeout(() => spawnBills(amount, from, to), tt))
          t += 430
        }
      } else if (e.kind === 'buy') {
        const tt = t
        const space = e.space
        timers.current.push(setTimeout(() => flashBuy(space), tt))
        t += 260
      } else {
        t += 120
      }
    }
    if (hasLong) timers.current.push(setTimeout(() => onAnimatingChange?.(false), t + 150))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.eventSeq])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const posOf = (pid: number, fallback: number) => display[pid] ?? fallback
  const curPlayer = state.players[state.current]
  const curArrived =
    !curPlayer || posOf(curPlayer.id, curPlayer.pos) === curPlayer.pos

  // gate the "you may buy" ring until the token actually arrives
  const effHighlight =
    highlight != null && highlight === state.pendingBuy && !curArrived ? null : highlight

  const occupants: Record<number, number[]> = {}
  state.players.forEach((p) => {
    if (p.bankrupt) return
    ;(occupants[posOf(p.id, p.pos)] ||= []).push(p.id)
  })

  return (
    <div className="relative w-full overflow-visible" style={{ aspectRatio: '1 / 1' }}>
      <div className="absolute select-none" style={{ inset: `${GUTTER}%` }}>
        <img
          src="/board.jpg"
          alt="The Landlord's Game board, Economic Game Co. 1906"
          className="absolute inset-0 h-full w-full rounded-md shadow-2xl ring-1 ring-black/40"
          draggable={false}
        />

        {/* faint tint + houses on owned tiles */}
        {BOARD.map((sp) => {
          const st = state.spaces[sp.index]
          if (st.ownerId == null) return null
          const owner = state.players[st.ownerId]
          const hi = lotHi === st.ownerId
          return (
            <div
              key={`tint-${sp.index}`}
              className={`absolute rounded-[2px] ${hi ? 'lg-pulse' : ''}`}
              style={{
                left: `${sp.box.x}%`,
                top: `${sp.box.y}%`,
                width: `${sp.box.w}%`,
                height: `${sp.box.h}%`,
                background: hi ? `${owner.color}55` : `${owner.color}26`,
                boxShadow: hi
                  ? `inset 0 0 0 2.5px ${owner.color}, 0 0 10px 1px ${owner.color}`
                  : `inset 0 0 0 1.5px ${owner.color}aa`,
                zIndex: hi ? 4 : undefined,
              }}
            >
              {st.houses > 0 && (
                <div className="absolute bottom-[6%] left-1/2 flex -translate-x-1/2 gap-[2px]">
                  {Array.from({ length: st.houses }).map((_, i) => (
                    <span
                      key={i}
                      className="lg-pop block rounded-[1px] border border-emerald-900 bg-emerald-500"
                      style={{ width: '0.42vw', height: '0.42vw', minWidth: 4, minHeight: 4 }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* protruding colour / BUY / PAY tabs */}
        {BOARD.map((sp) => {
          const flashing = buyFlash.includes(sp.index)
          const m: Marker | null = flashing
            ? { kind: 'buy', color: '#f4b41a', textColor: '#1d2a23', text: 'BUY', pulse: true }
            : markerFor(state, sp.index, curArrived)
          if (!m) return null
          const edge = edgeOf(sp)
          const vertical = edge === 'left' || edge === 'right'
          return (
            <div
              key={`tab-${sp.index}-${m.kind}`}
              className={`lg-tab-in pointer-events-none flex items-center justify-center font-extrabold shadow-md ${
                m.pulse ? 'lg-pulse' : ''
              }`}
              style={{
                ...tabStyle(sp, edge),
                background: m.color,
                color: m.textColor,
                border: m.alert ? '1.5px solid #fff' : '1.5px solid rgba(0,0,0,.35)',
                boxShadow: m.alert
                  ? '0 0 0 2px #c0392b, 0 0 9px 1px rgba(192,57,43,.8)'
                  : m.kind === 'buy'
                    ? '0 0 10px 1px rgba(244,180,26,.85)'
                    : undefined,
                textShadow: m.kind !== 'own' ? '0 1px 2px rgba(0,0,0,.5)' : undefined,
                zIndex: m.alert || m.kind === 'buy' ? 6 : 5,
              }}
            >
              <span
                style={{
                  fontSize: 'clamp(6px, 0.95vw, 11px)',
                  letterSpacing: m.kind === 'own' ? 0 : '0.04em',
                  lineHeight: 1,
                  transform: vertical ? 'rotate(-90deg)' : undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {m.text}
              </span>
            </div>
          )
        })}

        {/* clickable hotspots */}
        {onSpaceClick &&
          BOARD.map((sp) => (
            <button
              key={`hit-${sp.index}`}
              onClick={() => onSpaceClick(sp.index)}
              title={sp.name}
              className={`absolute cursor-pointer rounded-[2px] transition ${
                effHighlight === sp.index ? 'ring-4 ring-amber-400' : 'hover:bg-white/10'
              }`}
              style={{
                left: `${sp.box.x}%`,
                top: `${sp.box.y}%`,
                width: `${sp.box.w}%`,
                height: `${sp.box.h}%`,
              }}
            />
          ))}

        {/* player tokens */}
        {state.players.map((p) => {
          if (p.bankrupt) return null
          if (teleport && teleport.id === p.id) return null // the overlay flies instead
          const at = posOf(p.id, p.pos)
          const sp = BOARD[at]
          const here = occupants[at] || []
          const off = tokenOffset(here.indexOf(p.id), here.length)
          const cx = sp.box.x + sp.box.w / 2
          const cy = sp.box.y + sp.box.h / 2
          const isCurrent = curPlayer?.id === p.id
          const moving = at !== p.pos
          const isDancing = !!dancing[p.id]
          return (
            <div
              key={`tok-${p.id}`}
              className="pointer-events-none absolute z-36"
              style={{
                left: `calc(${cx}% + ${off.dx * sp.box.w * 0.1}%)`,
                top: `calc(${cy}% + ${off.dy * sp.box.h * 0.1}%)`,
                transform: 'translate(-50%, -50%)',
                transition:
                  'left 0.16s cubic-bezier(.34,1.4,.6,1), top 0.16s cubic-bezier(.34,1.4,.6,1)',
                width: 'clamp(16px, 2.6vw, 30px)',
                height: 'clamp(16px, 2.6vw, 30px)',
              }}
            >
              <div
                key={`hop-${at}`}
                className={`flex h-full w-full items-center justify-center rounded-full border-2 font-bold text-white shadow-lg ${
                  isDancing ? 'lg-dance' : moving ? 'lg-hop' : isCurrent ? 'lg-bob' : ''
                }`}
                style={{
                  background: p.color,
                  borderColor: isCurrent ? '#fff' : 'rgba(0,0,0,0.5)',
                  boxShadow: isCurrent
                    ? `0 0 0 3px ${p.color}88, 0 3px 8px rgba(0,0,0,.5)`
                    : '0 2px 5px rgba(0,0,0,.4)',
                  fontSize: 'clamp(9px, 1.3vw, 14px)',
                }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </div>
            </div>
          )
        })}

        {/* flying money */}
        {bills.map((b) => (
          <BillView
            key={b.id}
            bill={b}
            onDone={() => setBills((bs) => bs.filter((x) => x.id !== b.id))}
            onDance={(pid) => {
              setDancing((d) => ({ ...d, [pid]: true }))
              timers.current.push(
                setTimeout(() => setDancing((d) => ({ ...d, [pid]: false })), 1100),
              )
            }}
          />
        ))}

        {/* teleport overlay token — positioned/scaled entirely by the rAF loop */}
        {teleport &&
          (() => {
            const p = state.players[teleport.id]
            const c = centerOf(p.pos)
            return (
              <div
                ref={overlayRef}
                className="pointer-events-none absolute z-30 flex items-center justify-center rounded-full border-2 font-bold text-white"
                style={{
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 'clamp(16px, 2.6vw, 30px)',
                  height: 'clamp(16px, 2.6vw, 30px)',
                  background: p.color,
                  borderColor: '#fff',
                  boxShadow: `0 0 0 3px ${p.color}88, 0 4px 12px rgba(0,0,0,.55)`,
                  fontSize: 'clamp(9px, 1.3vw, 14px)',
                }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </div>
            )
          })()}

        {/* central money panel — the Public Treasury (LVT) or the Bank */}
        <TreasuryPanel lvt={state.lvt} treasury={state.treasury} onInfo={onInfo} />

        {/* face-down Chance deck, and the card that flips up from it */}
        <ChanceDeck />
        {chanceCard && <ChanceCardView card={chanceCard} />}

        {/* dice tumbling on the Miscellaneous panel (during a roll) */}
        {rollAnim &&
          (() => {
            const roller = state.players[rollAnim.playerId]
            if (!roller || roller.bankrupt) return null
            const rAt = posOf(roller.id, roller.pos)
            const rC = centerOf(rAt)
            return (
              <>
                <RollTargetLine
                  from={DICE_AT}
                  to={rC}
                  color={roller.color}
                />
                <div
                  className="pointer-events-none absolute z-40"
                  style={{
                    left: `${DICE_AT.x}%`,
                    top: `${DICE_AT.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="flex gap-3">
                    <BoardDie value={rollAnim.d1} settled={rollAnim.settled} />
                    <BoardDie value={rollAnim.d2} settled={rollAnim.settled} />
                  </div>
                </div>
              </>
            )
          })()}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TreasuryPanel({
  lvt,
  treasury,
  onInfo,
}: {
  lvt: boolean
  treasury: number
  onInfo?: () => void
}) {
  const rows = breakdown(treasury)
  return (
    <div
      className="pointer-events-none absolute z-20 flex flex-col items-center justify-center rounded"
      style={{
        // sit just inside the engraved "Public Treasury" frame (x≈29–71%, y≈50–72%)
        left: '50%',
        top: '60.8%',
        transform: 'translate(-50%, -50%)',
        width: 'min(40%, 300px)',
        minHeight: '18.5%',
        padding: '8px 14px 10px',
        // opaque enough to cover the board's own engraving with our own panel
        background: lvt ? 'rgba(243,232,203,0.975)' : 'rgba(243,232,203,0.955)',
        border: `1.5px solid ${lvt ? 'rgba(176,120,30,.85)' : 'rgba(80,70,40,.5)'}`,
        boxShadow: lvt
          ? '0 0 20px 2px rgba(244,180,26,.35), inset 0 0 0 1px rgba(176,120,30,.3)'
          : '0 2px 12px rgba(0,0,0,.35), inset 0 0 0 1px rgba(80,70,40,.2)',
      }}
    >
      {/* big title (covers the engraved "PUBLIC TREASURY") */}
      <div className="relative flex w-full items-center justify-center">
        <span
          className="font-bold uppercase tracking-[0.12em] text-[#3a2d12]"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(11px,1.5vw,17px)',
            letterSpacing: '0.06em',
            lineHeight: 1.02,
            textWrap: 'balance',
          }}
        >
          {lvt ? 'Public Treasury' : 'The Bank'}
        </span>
        {onInfo && (
          <button
            onClick={onInfo}
            title="What is this?"
            className="pointer-events-auto absolute -right-1 -top-0.5 flex items-center justify-center rounded-full border border-[#3a2d12]/50 text-[#3a2d12] hover:bg-[#3a2d12]/10"
            style={{ width: 17, height: 17, fontSize: 10, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700 }}
          >
            i
          </button>
        )}
      </div>
      <div className="my-1.5 h-px w-4/5" style={{ background: 'rgba(58,45,18,.35)' }} />

      {lvt ? (
        <>
          <div
            className="flex flex-wrap items-end justify-center gap-x-2.5 gap-y-1.5"
            style={{ minHeight: 'clamp(20px,2.8vw,34px)' }}
          >
            {rows.length === 0 ? (
              <span className="text-[#3a2d12]/55" style={{ fontSize: 'clamp(9px,1.1vw,12px)' }}>
                paid out — collecting…
              </span>
            ) : (
              rows.map((d) => <BillStack key={d.value} value={d.value} color={d.color} count={d.count} />)
            )}
          </div>
          <div
            key={treasury}
            className="lg-pop mt-1 font-mono font-bold text-[#6b3d12]"
            style={{ fontSize: 'clamp(15px,2.1vw,26px)', lineHeight: 1.05 }}
          >
            ${treasury}
          </div>
          <div className="mt-0.5 text-center text-[#3a2d12]/70" style={{ fontSize: 'clamp(7px,0.85vw,10px)' }}>
            Ground rents, pooled &amp; paid back to all
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            {DENOMS.map(([v, c]) => (
              <BillStack key={v} value={v} color={c} />
            ))}
          </div>
          <div className="mt-1.5 text-center text-[#3a2d12]/70" style={{ fontSize: 'clamp(7px,0.85vw,10px)' }}>
            The house collects the rents &amp; pays the wages
          </div>
        </>
      )}
    </div>
  )
}

function BillStack({ value, color, count }: { value: number; color: string; count?: number }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="flex items-center justify-center rounded-[2px] font-bold"
        style={{
          width: 'clamp(16px,2.2vw,26px)',
          height: 'clamp(10px,1.4vw,16px)',
          background: color,
          color: 'rgba(0,0,0,.7)',
          border: '1px solid rgba(0,0,0,.4)',
          fontSize: 'clamp(6px,0.8vw,9px)',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
        }}
      >
        ${value}
      </span>
      {count != null && (
        <span className="font-mono text-[#3a2d12]" style={{ fontSize: 'clamp(7px,0.85vw,10px)' }}>
          ×{count}
        </span>
      )}
    </div>
  )
}

function ChanceDeck() {
  const cardW = 'clamp(38px,6.5vw,85px)'
  const cardH = 'clamp(28px,4.2vw,52px)'
  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ left: `${PILE.x}%`, top: `${PILE.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: -i * 1.5,
            top: i * 1.5,
            width: cardW,
            height: cardH,
            borderRadius: 4,
            background: 'repeating-linear-gradient(45deg,#9e2b22,#9e2b22 4px,#b5352b 4px,#b5352b 8px)',
            border: '1.5px solid #f4ecd6',
            boxShadow: '0 1px 4px rgba(0,0,0,.5)',
          }}
        />
      ))}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: -3,
          top: 3,
          width: cardW,
          height: cardH,
        }}
      >
        <span
          className="font-bold uppercase tracking-wider text-[#f4ecd6]"
          style={{ fontSize: 'clamp(5px,0.9vw,12px)', letterSpacing: '0.02em' }}
        >
          Chance
        </span>
      </div>
    </div>
  )
}

function ChanceCardView({ card }: { card: { text: string; variant: ChanceVariant } }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 50)
    return () => clearTimeout(id)
  }, [])
  const pos = shown ? CARD_AT : PILE
  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'left .8s cubic-bezier(.3,1.1,.5,1), top .8s cubic-bezier(.3,1.1,.5,1)',
        width: 'min(48%, 300px)',
        perspective: 1000,
      }}
    >
      <div
        className="relative"
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform .8s ease',
          transform: `rotateY(${shown ? 0 : 180}deg) scale(${shown ? 1 : 0.4})`,
        }}
      >
        <div
          className="overflow-hidden rounded-lg"
          style={{
            backfaceVisibility: 'hidden',
            background: '#f6efda',
            border: '3px solid #c0392b',
            boxShadow: '0 10px 30px rgba(0,0,0,.55)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 text-white"
            style={{ background: CHANCE_ACCENT[card.variant].bar }}
          >
            <span
              className="font-bold uppercase tracking-widest"
              style={{ fontSize: 'clamp(13px,1.7vw,20px)', fontFamily: 'Georgia, serif' }}
            >
              Chance
            </span>
            <span
              className="uppercase tracking-wider opacity-90"
              style={{ fontSize: 'clamp(9px,1.05vw,13px)' }}
            >
              {CHANCE_ACCENT[card.variant].label}
            </span>
          </div>
          <div
            className="px-4 py-3 text-center text-[#1d2a23]"
            style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(12px,1.6vw,18px)' }}
          >
            {card.text}
          </div>
        </div>
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'repeating-linear-gradient(45deg,#9e2b22,#9e2b22 6px,#b5352b 6px,#b5352b 12px)',
            border: '3px solid #f4ecd6',
          }}
        />
      </div>
    </div>
  )
}

const DICE_PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
}

function RollTargetLine({
  from,
  to,
  color,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  color: string
}) {
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const stripeId = `lg-roll-stripes-${color.replace('#', '')}`

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-35 h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id="lg-roll-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.55" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="lg-roll-grad" gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
          <stop offset="0%" stopColor={color} stopOpacity="0.72" />
          <stop offset="55%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0.18" />
        </linearGradient>
        <pattern
          id={stripeId}
          width="2.4"
          height="2.4"
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${angle + 90} ${mid.x} ${mid.y})`}
        >
          <rect width="1.2" height="2.4" fill={color} fillOpacity="0.82" />
        </pattern>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="url(#lg-roll-grad)"
        strokeWidth="0.55"
        strokeLinecap="round"
        filter="url(#lg-roll-glow)"
        className="lg-roll-line"
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={`url(#${stripeId})`}
        strokeWidth="0.4"
        strokeLinecap="butt"
        strokeOpacity="0.9"
        className="lg-roll-stripes-a"
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth="0.28"
        strokeLinecap="butt"
        strokeDasharray="2.1 1.7"
        strokeDashoffset={len * 0.22}
        strokeOpacity="0.75"
        className="lg-roll-stripes-b"
      />
    </svg>
  )
}

function BoardDie({ value, settled }: { value: number; settled: boolean }) {
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 place-items-center rounded-lg bg-[#f4ecd6] shadow-2xl ring-2 ring-black/40 ${
        settled ? 'lg-pop' : 'lg-tumble'
      }`}
      style={{
        width: 'clamp(34px, 5vw, 64px)',
        height: 'clamp(34px, 5vw, 64px)',
        padding: 'clamp(3px, 0.5vw, 6px)',
      }}
    >
      {(DICE_PIPS[value] || DICE_PIPS[1]).map((on, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 'clamp(5px, 0.85vw, 10px)',
            height: 'clamp(5px, 0.85vw, 10px)',
            background: on ? '#1d2a23' : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

function BillView({
  bill,
  onDone,
  onDance,
}: {
  bill: Bill
  onDone: () => void
  onDance?: (pid: number) => void
}) {
  const [pos, setPos] = useState({ x: bill.x0, y: bill.y0 })
  const flightMs = bill.slow ? DIVIDEND_FLIGHT * 1000 : 700
  useEffect(() => {
    const t1 = setTimeout(() => setPos({ x: bill.x1, y: bill.y1 }), 30)
    const t2 = setTimeout(() => {
      if (bill.dancePlayerId != null) onDance?.(bill.dancePlayerId)
      onDone()
    }, flightMs + bill.delay + 80)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className={`pointer-events-none absolute flex items-center justify-center ${
        bill.slow ? 'z-32' : 'z-30'
      }`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: `translate(-50%, -50%) rotate(${bill.rot}deg) scale(${bill.slow ? 1.15 : 1})`,
        transition: `left ${flightMs}ms cubic-bezier(.25,.05,.2,1) ${bill.delay}ms, top ${flightMs}ms cubic-bezier(.25,.05,.2,1) ${bill.delay}ms`,
        width: bill.slow ? 'clamp(14px, 1.8vw, 22px)' : 'clamp(12px, 1.5vw, 18px)',
        height: bill.slow ? 'clamp(8px, 1.1vw, 13px)' : 'clamp(7px, 0.9vw, 11px)',
        background: bill.color,
        border: '1px solid rgba(0,0,0,.45)',
        borderRadius: 2,
        boxShadow: bill.slow
          ? `0 0 10px 2px ${bill.color}88, 0 2px 6px rgba(0,0,0,.5)`
          : '0 1px 3px rgba(0,0,0,.45)',
      }}
    >
      <span style={{ fontSize: bill.slow ? 8 : 7, fontWeight: 800, color: 'rgba(0,0,0,.5)' }}>$</span>
    </div>
  )
}
