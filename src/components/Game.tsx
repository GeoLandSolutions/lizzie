import { useEffect, useReducer, useRef, useState } from 'react'
import { Board } from './Board'
import { BOARD, GROUPS, WAGES_TO_WIN, HOUSE_COST, MAX_HOUSES } from '../game/board'
import {
  reducer,
  createInitialState,
  TOKEN_COLORS,
  rentFor,
  netWorth,
  lotsOwned,
} from '../game/engine'
import type { GameState } from '../game/types'

// skip the setup screen and start straight away with the four default seats
function autoStartState(): GameState {
  return reducer(createInitialState(), {
    t: 'setup',
    players: NAME_CHOICES.map((pair, i) => ({ name: pair[0], color: TOKEN_COLORS[i] })),
  })
}

export function Game({ autoStart = false }: { autoStart?: boolean }) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    autoStart ? autoStartState : createInitialState,
  )
  const [selected, setSelected] = useState<number | null>(null)
  const [animating, setAnimating] = useState(false) // a long teleport is playing
  const [infoOpen, setInfoOpen] = useState(false)
  const [tall, setTall] = useState(false) // tall = board stacked above sidebar (bigger board)

  // ---- autonomous seats: drive the current player if they're on "Auto" ----
  useEffect(() => {
    if (state.phase === 'setup' || state.phase === 'gameover') return
    if (animating) return // wait out the "hauled away" sequence before acting
    const p = state.players[state.current]
    if (!p || p.bankrupt || !p.auto) return
    // give the turn's choreography (hops, money, BUY stamp) time to play
    const delay = state.phase === 'action' ? 1700 : 850
    const t = setTimeout(() => {
      if (state.phase === 'roll') dispatch({ t: 'roll' })
      else if (state.phase === 'jail')
        dispatch(p.cash >= 150 ? { t: 'payJail' } : { t: 'roll' })
      else if (state.phase === 'action') {
        if (state.pendingBuy != null) dispatch({ t: 'buy' }) // buy if you can
        else dispatch({ t: 'endTurn' })
      }
    }, delay)
    return () => clearTimeout(t)
  }, [state, dispatch, animating])

  if (state.phase === 'setup') {
    return <Setup onStart={(players) => dispatch({ t: 'setup', players })} />
  }

  // a player ruined on their own turn would otherwise stall the turn loop —
  // surface a dialog that advances play (auto seats on a short countdown)
  const cur = state.players[state.current]
  const ruined = state.phase !== 'gameover' && !!cur?.bankrupt

  return (
    <div className="min-h-screen w-full bg-[#1d2a23] text-[#f4ecd6]">
      <div className="mx-auto max-w-[1600px] px-2 py-3 lg:px-4">
        <Header
          state={state}
          dispatch={dispatch}
          animating={animating}
          tall={tall}
          onToggleTall={() => setTall((t) => !t)}
        />
        <div
          className={
            tall ? 'flex flex-col gap-4' : 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]'
          }
        >
          <div>
            <div
              className="mx-auto rounded-lg transition-all duration-700"
              style={{
                // keep the square board within the viewport so it never clips vertically.
                // Tall mode lets it grow much larger (board is the star).
                width: '100%',
                maxWidth: tall ? 'min(100%, 94vh)' : 'min(100%, calc(100vh - 7rem))',
                ...(state.lvt
                  ? {
                      boxShadow:
                        '0 0 0 2px rgba(244,180,26,.7), 0 0 45px 6px rgba(244,180,26,.45)',
                      background:
                        'radial-gradient(120% 120% at 50% 0%, rgba(244,180,26,.18), transparent 60%)',
                    }
                  : {}),
              }}
            >
              <Board
                state={state}
                highlight={state.pendingBuy ?? selected}
                onSpaceClick={(i) => setSelected(i)}
                onAnimatingChange={setAnimating}
                onInfo={() => setInfoOpen(true)}
              />
            </div>
            <Legend />
          </div>
          <Sidebar
            state={state}
            dispatch={dispatch}
            selected={selected}
            setSelected={setSelected}
            tall={tall}
          />
        </div>
      </div>
      {state.phase === 'gameover' && <GameOver state={state} dispatch={dispatch} />}
      {ruined && <Poorhouse state={state} dispatch={dispatch} />}
      {infoOpen && <InfoDialog onClose={() => setInfoOpen(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Header({
  state,
  dispatch,
  animating,
  tall,
  onToggleTall,
}: {
  state: GameState
  dispatch: React.Dispatch<any>
  animating: boolean
  tall: boolean
  onToggleTall: () => void
}) {
  // pause the LVT timer while a long animation plays, so it can't interrupt it
  const active = state.phase !== 'gameover' && !animating
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[#f4ecd6]/20 pb-3">
      <div>
        <h1
          className="text-2xl font-bold tracking-wide lg:text-3xl"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          The Landlord&rsquo;s Game
        </h1>
        <p className="text-xs text-[#f4ecd6]/60 lg:text-sm">
          Economic Game Co., New York &mdash; patented 1904 by Lizzie J. Magie
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={onToggleTall}
          title="Toggle a taller, bigger board vs. a wider side-by-side layout"
          className="rounded-md border border-[#f4ecd6]/25 px-3 py-2 text-sm font-semibold text-[#f4ecd6]/80 transition hover:bg-[#f4ecd6]/10"
        >
          {tall ? '↔ Be Wide' : '↕ Be Tall'}
        </button>
        <CountdownControl dispatch={dispatch} active={active} />
        <LvtSwitch state={state} dispatch={dispatch} />
      </div>
    </header>
  )
}

function CountdownControl({
  dispatch,
  active,
}: {
  dispatch: React.Dispatch<any>
  active: boolean
}) {
  const [on, setOn] = useState(true)
  const [dur, setDur] = useState(50)
  const [left, setLeft] = useState(50)
  const leftRef = useRef(left)
  leftRef.current = left

  useEffect(() => {
    if (!on || !active) return
    const id = setInterval(() => {
      // dispatch the toggle here (NOT inside a setState updater, which React may
      // double-invoke and thereby toggle LVT twice → no net change)
      if (leftRef.current <= 1) {
        dispatch({ t: 'toggleLVT' })
        setLeft(dur)
      } else {
        setLeft((l) => l - 1)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [on, active, dur, dispatch])

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  const faster = () => {
    const newDur = Math.max(10, dur - 10)
    setDur(newDur)
    if (left - 10 <= 0) {
      // shaving past zero trips the toggle immediately
      dispatch({ t: 'toggleLVT' })
      setLeft(newDur)
    } else {
      setLeft(left - 10)
    }
  }
  const slower = () => {
    setDur((d) => d + 10)
    setLeft((l) => l + 10)
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#f4ecd6]/15 bg-[#26352c] px-3 py-1.5">
      <button
        onClick={() => setOn((v) => !v)}
        title="Auto-toggle Land Value Tax on a timer"
        className="flex items-center gap-1.5 text-[11px] font-semibold"
      >
        <span
          className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${on ? 'bg-amber-500' : 'bg-[#f4ecd6]/20'}`}
        >
          <span
            className={`h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`}
          />
        </span>
        <span className={on ? 'text-[#f4ecd6]' : 'text-[#f4ecd6]/50'}>Countdown</span>
      </button>

      <div className="text-center leading-none">
        <div
          className={`font-mono text-lg font-bold tabular-nums ${on ? 'text-amber-300' : 'text-[#f4ecd6]/40'}`}
        >
          {mmss}
        </div>
        <div className="text-[9px] text-[#f4ecd6]/45">at 0:00, LVT toggles</div>
      </div>

      <div className="flex flex-col gap-0.5">
        <button
          onClick={faster}
          className="rounded bg-[#f4ecd6]/10 px-1.5 py-0.5 text-[9px] font-semibold hover:bg-[#f4ecd6]/20"
        >
          LVT Faster −10s
        </button>
        <button
          onClick={slower}
          className="rounded bg-[#f4ecd6]/10 px-1.5 py-0.5 text-[9px] font-semibold hover:bg-[#f4ecd6]/20"
        >
          LVT Slower +10s
        </button>
      </div>
    </div>
  )
}

function LvtSwitch({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<any> }) {
  const on = state.lvt
  return (
    <div className="flex items-center gap-3">
      {(on || state.treasury > 0) && (
        <div
          key={state.treasury}
          className="lg-pop hidden rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-center sm:block"
        >
          <div className="text-[10px] uppercase tracking-wider text-amber-200/80">
            Public Treasury
          </div>
          <div className="font-mono text-lg font-bold text-amber-300">${state.treasury}</div>
        </div>
      )}
      <button
        onClick={() => dispatch({ t: 'toggleLVT' })}
        title="Switch the whole economy to the Land Value Tax ruleset"
        className={`group relative flex items-center gap-3 overflow-hidden rounded-full border px-4 py-2 text-left transition-all duration-500 ${
          on
            ? 'border-amber-300 text-[#1d2a23] shadow-[0_0_25px_rgba(244,180,26,.55)]'
            : 'border-[#f4ecd6]/25 text-[#f4ecd6] hover:border-amber-300/60'
        }`}
        style={
          on
            ? { background: 'linear-gradient(100deg,#f9d976,#f4b41a 55%,#e8932a)' }
            : { background: 'rgba(255,255,255,.04)' }
        }
      >
        <span
          className={`text-xl transition-transform duration-500 ${on ? 'rotate-0 scale-110' : '-rotate-12 opacity-70'}`}
        >
          {on ? '☀' : '☁'}
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold">Land Value Tax</span>
          <span className={`block text-[11px] ${on ? 'text-[#1d2a23]/70' : 'text-[#f4ecd6]/55'}`}>
            {on ? '✦ Everything gets better!' : 'tap to share the land'}
          </span>
        </span>
        {/* the switch track */}
        <span
          className={`ml-1 flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-300 ${
            on ? 'bg-[#1d2a23]/30' : 'bg-[#f4ecd6]/15'
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
              on ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#f4ecd6]/70">
      {Object.values(GROUPS).map((g) => (
        <span key={g.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: g.ring }}
          />
          {g.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Sidebar({
  state,
  dispatch,
  selected,
  setSelected,
  tall,
}: {
  state: GameState
  dispatch: React.Dispatch<any>
  selected: number | null
  setSelected: (i: number | null) => void
  tall: boolean
}) {
  const p = state.players[state.current]
  return (
    <aside className="flex flex-col gap-4">
      <TurnPanel state={state} dispatch={dispatch} tall={tall} />
      {selected != null && (
        <SpaceInspector
          state={state}
          index={selected}
          dispatch={dispatch}
          onClose={() => setSelected(null)}
        />
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {state.players.map((pl) => (
          <PlayerCard
            key={pl.id}
            state={state}
            id={pl.id}
            isCurrent={pl.id === p.id}
            dispatch={dispatch}
          />
        ))}
      </div>
      <LogFeed state={state} />
    </aside>
  )
}

function Pip({ on }: { on: boolean }) {
  return (
    <span
      className="block rounded-full"
      style={{ width: 7, height: 7, background: on ? '#1d2a23' : 'transparent' }}
    />
  )
}

function Die({ value, faded }: { value: number; faded?: boolean }) {
  // pip layout per face
  const map: Record<number, boolean[]> = {
    1: [false, false, false, false, true, false, false, false, false],
    2: [true, false, false, false, false, false, false, false, true],
    3: [true, false, false, false, true, false, false, false, true],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true],
  }
  return (
    <div
      className="lg-pop grid h-11 w-11 grid-cols-3 grid-rows-3 place-items-center rounded-lg bg-[#f4ecd6] p-1.5 shadow-inner ring-1 ring-black/30"
      style={{ opacity: faded ? 0.45 : 1 }}
    >
      {(map[value] || map[1]).map((on, i) => (
        <Pip key={i} on={on} />
      ))}
    </div>
  )
}

// The gutter dice — calm placeholders showing the latest roll. The whimsical
// tumbling spectacle plays on the board's Miscellaneous panel instead.
function DiceTray({
  dice,
  rollCount,
  vertical,
}: {
  dice: [number, number] | null
  rollCount: number
  vertical?: boolean
}) {
  const faded = !dice
  const a = dice ? dice[0] : 1
  const b = dice ? dice[1] : 1
  return (
    <div className={`flex ${vertical ? 'flex-col' : ''} gap-1.5`}>
      <Die value={a} faded={faded} key={`a-${rollCount}`} />
      <Die value={b} faded={faded} key={`b-${rollCount}`} />
    </div>
  )
}

function TurnPanel({
  state,
  dispatch,
  tall,
}: {
  state: GameState
  dispatch: React.Dispatch<any>
  tall: boolean
}) {
  const p = state.players[state.current]
  const pending = state.pendingBuy
  const sp = pending != null ? BOARD[pending] : null

  return (
    <div className="relative rounded-lg border border-[#f4ecd6]/15 bg-[#26352c] p-4 shadow-lg">
      {/* in wide mode, the dice live LEFT of the Roll Dice button, in the gutter
          between this panel and the board frame; stacked vertically */}
      {!tall && (
        <div className="absolute -left-14 top-3 hidden lg:flex">
          <DiceTray dice={state.dice} rollCount={state.rollCount} vertical />
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white"
          style={{ background: p.color }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <div className="font-semibold leading-tight">{p.name}&rsquo;s turn</div>
          <div className="text-xs text-[#f4ecd6]/60">${p.cash} in hand</div>
        </div>
        {tall && (
          <div className="ml-auto">
            <DiceTray dice={state.dice} rollCount={state.rollCount} />
          </div>
        )}
      </div>

      {p.inJail && state.phase !== 'gameover' && (
        <div className="mb-2 rounded bg-red-900/40 px-2 py-1 text-xs text-red-200">
          In Jail &mdash; turn {p.jailTurns + 1} of 3
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {state.phase === 'roll' && (
          <Btn onClick={() => dispatch({ t: 'roll' })} primary>
            🎲 Roll Dice
          </Btn>
        )}

        {state.phase === 'jail' && (
          <>
            <Btn onClick={() => dispatch({ t: 'roll' })} primary>
              🎲 Roll for Doubles
            </Btn>
            <Btn onClick={() => dispatch({ t: 'payJail' })} disabled={p.cash < 50}>
              Pay $50 Bail
            </Btn>
          </>
        )}

        {state.phase === 'action' && sp && (
          <>
            <Btn onClick={() => dispatch({ t: 'buy' })} primary disabled={p.cash < (sp.price ?? 0)}>
              Buy {sp.name} &mdash; ${sp.price}
            </Btn>
            <Btn onClick={() => dispatch({ t: 'skipBuy' })}>Pass</Btn>
          </>
        )}

        {state.phase === 'action' && !sp && (
          <Btn onClick={() => dispatch({ t: 'endTurn' })} primary>
            {state.isDouble ? '🎲 Roll Again (doubles)' : 'End Turn ▸'}
          </Btn>
        )}
      </div>
    </div>
  )
}

function Btn({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-amber-500 text-[#1d2a23] hover:bg-amber-400'
          : 'border border-[#f4ecd6]/30 text-[#f4ecd6] hover:bg-[#f4ecd6]/10'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------

function SpaceInspector({
  state,
  index,
  dispatch,
  onClose,
}: {
  state: GameState
  index: number
  dispatch: React.Dispatch<any>
  onClose: () => void
}) {
  const sp = BOARD[index]
  const st = state.spaces[index]
  const owner = st.ownerId != null ? state.players[st.ownerId] : null
  const me = state.players[state.current]
  const canBuild =
    sp.type === 'property' &&
    st.ownerId === me.id &&
    state.phase === 'action' &&
    st.houses < MAX_HOUSES &&
    me.cash >= HOUSE_COST

  return (
    <div className="rounded-lg border border-amber-500/40 bg-[#f4ecd6] p-3 text-[#1d2a23] shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-lg font-bold leading-tight"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {sp.name}
          </div>
          {sp.subtitle && <div className="text-xs text-[#1d2a23]/60">{sp.subtitle}</div>}
        </div>
        <button onClick={onClose} className="text-[#1d2a23]/50 hover:text-[#1d2a23]">
          ✕
        </button>
      </div>

      <div className="mt-2 space-y-0.5 text-sm">
        {sp.price != null && <Row k="For sale" v={`$${sp.price}`} />}
        {sp.type === 'property' && <Row k="Base land rent" v={`$${sp.rent}`} />}
        {sp.type === 'property' && st.ownerId != null && (
          <Row k="Current rent" v={`$${rentFor(state, index)}`} />
        )}
        {sp.type === 'railroad' && <Row k="Fare" v="$5 → $10 → $20 → $50 by count" />}
        {sp.type === 'utility' && <Row k="Charge" v="$5 (or $25 if both owned)" />}
        {sp.tax != null && <Row k="Charge" v={`$${sp.tax}`} />}
        {sp.type === 'property' && <Row k="Houses" v={`${st.houses} / ${MAX_HOUSES}`} />}
        <Row k="Owner" v={owner ? owner.name : 'Unclaimed (Treasury)'} />
      </div>

      {(canBuild || (sp.type === 'property' && st.houses > 0 && st.ownerId === me.id)) && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => dispatch({ t: 'build', index })}
            disabled={!canBuild}
            className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
          >
            Build house (${HOUSE_COST})
          </button>
          {st.houses > 0 && st.ownerId === me.id && (
            <button
              onClick={() => dispatch({ t: 'sell', index })}
              className="rounded border border-[#1d2a23]/30 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-[#1d2a23]/10"
            >
              Sell house (+${Math.floor(HOUSE_COST / 2)})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#1d2a23]/60">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PlayerCard({
  state,
  id,
  isCurrent,
  dispatch,
}: {
  state: GameState
  id: number
  isCurrent: boolean
  dispatch: React.Dispatch<any>
}) {
  const p = state.players[id]
  const lots = lotsOwned(state, id).length
  const props = BOARD.filter((sp) => state.spaces[sp.index].ownerId === id).length
  return (
    <div
      className={`rounded-lg border p-3 transition ${
        p.bankrupt
          ? 'border-transparent bg-[#26352c]/40 opacity-50'
          : isCurrent
            ? 'border-amber-400 bg-[#2c3d31]'
            : 'border-[#f4ecd6]/10 bg-[#26352c]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-5 w-5 rounded-full border border-white/70"
          style={{ background: p.color }}
        />
        <span className="font-semibold">{p.name}</span>
        {p.inJail && <span className="text-[10px] text-red-300">⛓ jailed</span>}
        {p.bankrupt && <span className="text-[10px] text-[#f4ecd6]/50">ruined</span>}
        <button
          onClick={() => dispatch({ t: 'toggleAuto', id })}
          disabled={p.bankrupt}
          title={p.auto ? 'Playing automatically' : 'Play this seat automatically'}
          className={`ml-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-30 ${
            p.auto
              ? 'bg-emerald-500/90 text-[#1d2a23]'
              : 'border border-[#f4ecd6]/25 text-[#f4ecd6]/70 hover:border-emerald-400/60'
          }`}
        >
          <span
            className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${p.auto ? 'bg-[#1d2a23]/30' : 'bg-[#f4ecd6]/20'}`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full bg-white transition-transform ${p.auto ? 'translate-x-2.5' : ''}`}
            />
          </span>
          {p.auto ? `AUTO${isCurrent ? ' •' : ''}` : 'auto'}
        </button>
      </div>
      <div className="mt-1.5 text-right font-mono text-lg">
        <span key={p.cash} className="lg-pop inline-block">
          ${p.cash}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#f4ecd6]/65">
        <span>Wages {p.wages}/{WAGES_TO_WIN}</span>
        <span>{props} deeds</span>
        <span>{lots} lots</span>
        {p.luxury > 0 && <span>{p.luxury} luxury</span>}
        <span>net ${netWorth(state, id)}</span>
      </div>
      {/* wages progress */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1d2a23]">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${Math.min(100, (p.wages / WAGES_TO_WIN) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function LogFeed({ state }: { state: GameState }) {
  return (
    <div className="rounded-lg border border-[#f4ecd6]/10 bg-[#1a241e] p-3">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#f4ecd6]/50">
        Ledger
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1 text-[13px] leading-snug">
        {state.log.map((e) => (
          <div
            key={e.id}
            className={
              e.kind === 'money'
                ? 'text-amber-200'
                : e.kind === 'event'
                  ? 'text-rose-200'
                  : e.kind === 'system'
                    ? 'text-emerald-200'
                    : 'text-[#f4ecd6]/75'
            }
          >
            {e.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function GameOver({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<any> }) {
  const ranked = [...state.players].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id))
  const winner = state.winnerId != null ? state.players[state.winnerId] : null
  const allAuto = state.players.length > 0 && state.players.every((p) => p.auto)

  // when every seat is on Auto, count down and deal a fresh game automatically
  const [cd, setCd] = useState(10)
  useEffect(() => {
    if (!allAuto) return
    if (cd <= 0) {
      dispatch({ t: 'setup', players: state.players.map((p) => ({ name: p.name, color: p.color })) })
      return
    }
    const id = setTimeout(() => setCd((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [allAuto, cd, dispatch, state.players])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-[#f4ecd6] p-6 text-[#1d2a23] shadow-2xl">
        <h2 className="text-center text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
          The Game Is Won
        </h2>
        {winner && (
          <p className="mt-1 text-center text-lg">
            🏆 <span className="font-bold">{winner.name}</span> prevails!
          </p>
        )}
        <div className="mt-4 space-y-1.5">
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded bg-[#1d2a23]/5 px-3 py-1.5"
            >
              <span className="w-5 text-center font-bold">{i + 1}</span>
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: p.color }}
              />
              <span className="font-semibold">{p.name}</span>
              <span className="ml-auto font-mono">${netWorth(state, p.id)}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            dispatch({
              t: 'setup',
              players: state.players.map((p) => ({ name: p.name, color: p.color })),
            })
          }
          className="mt-5 w-full rounded-md bg-amber-500 py-2.5 font-semibold text-[#1d2a23] hover:bg-amber-400"
        >
          {allAuto ? `Play Again — next game in 0:${String(Math.max(0, cd)).padStart(2, '0')}` : 'Play Again'}
        </button>
        <button
          onClick={() => dispatch({ t: 'newGame' })}
          className="mt-2 w-full rounded-md border border-[#1d2a23]/25 py-1.5 text-sm font-semibold text-[#1d2a23]/70 hover:bg-[#1d2a23]/5"
        >
          New players
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

// Shown when the current player is ruined on their own turn. Auto seats count
// down and advance the turn themselves so an unattended playthrough never stalls.
function Poorhouse({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<any> }) {
  const p = state.players[state.current]
  const auto = p.auto

  const [cd, setCd] = useState(5)
  useEffect(() => {
    if (!auto) return
    if (cd <= 0) {
      dispatch({ t: 'endTurn' })
      return
    }
    const id = setTimeout(() => setCd((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [auto, cd, dispatch])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-[#f4ecd6] p-6 text-[#1d2a23] shadow-2xl">
        <div className="text-center text-4xl">🏚️</div>
        <h2
          className="mt-2 text-center text-2xl font-bold"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          To the Poorhouse
        </h2>
        <p className="mt-3 text-center leading-relaxed">
          <span className="font-bold" style={{ color: p.color }}>
            {p.name}
          </span>{' '}
          is ruined and retires to the Poorhouse. Their holdings revert to the Treasury.
        </p>
        <button
          onClick={() => dispatch({ t: 'endTurn' })}
          className="mt-5 w-full rounded-md bg-amber-500 py-2.5 font-semibold text-[#1d2a23] hover:bg-amber-400"
        >
          {auto ? `Play on — ${Math.max(0, cd)}s` : 'Play on ▸'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function InfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[#f4ecd6] p-6 text-[#1d2a23] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Why a Public Treasury?
          </h2>
          <button onClick={onClose} className="text-xl text-[#1d2a23]/50 hover:text-[#1d2a23]">
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-3 text-sm leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
          <p>
            <strong>Lizzie J. Magie</strong> (1866–1948) invented <em>The Landlord&rsquo;s Game</em> in
            1904 to teach the ideas of the economist <strong>Henry George</strong>. She gave it two
            sets of rules: a <em>monopolist</em> game, where players drive each other to ruin, and an
            <em> anti-monopolist</em> game, where land rents are shared and everyone prospers together.
          </p>
          <blockquote className="border-l-4 border-[#b0781e] pl-3 italic text-[#3a2d12]">
            &ldquo;It is a practical demonstration of the present system of land-grabbing with all its
            usual outcomes and consequences.&rdquo;
            <span className="mt-1 block text-xs not-italic text-[#3a2d12]/70">— Lizzie Magie, 1902</span>
          </blockquote>
          <p>
            George argued in <em>Progress and Poverty</em> (1879) that the value of land comes from the
            whole community, not its owner. So the &ldquo;rent&rdquo; of land should be collected by the
            public — a single tax on land values — to fund society and let all other taxes fall away.
          </p>
          <blockquote className="border-l-4 border-[#b0781e] pl-3 italic text-[#3a2d12]">
            &ldquo;The equal right of all men to the use of land is as clear as their equal right to
            breathe the air.&rdquo;
            <span className="mt-1 block text-xs not-italic text-[#3a2d12]/70">— Henry George</span>
          </blockquote>
          <p className="rounded-md bg-[#1d2a23]/5 p-3">
            <strong>In this game:</strong> turn on <strong>Land Value Tax</strong> and every rent flows
            into the <strong>Public Treasury</strong>, then pays back to all players as a dividend when
            wages are drawn — shared prosperity. Turn it off and it&rsquo;s <strong>The Bank</strong>:
            landlords keep the rents, and the rich get richer. Watch how differently the two games end.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-amber-500 py-2.5 font-semibold text-[#1d2a23] hover:bg-amber-400"
        >
          Back to the game
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

// each seat's default is a period name, randomly the gentleman or the lady
const NAME_CHOICES = [
  ['Henry', 'Henrietta'],
  ['George', 'Georgina'],
  ['Lizzie', 'Lizzie'],
  ['Magie', 'Magie'],
]

function Setup({ onStart }: { onStart: (players: Array<{ name: string; color: string }>) => void }) {
  const [count, setCount] = useState(2)
  // deterministic for SSR, then randomised on the client after mount
  const [names, setNames] = useState(() => NAME_CHOICES.map((pair) => pair[0]))
  useEffect(() => {
    setNames(NAME_CHOICES.map((pair) => (Math.random() < 0.5 ? pair[0] : pair[1])))
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1d2a23] p-4 text-[#f4ecd6]">
      <div className="w-full max-w-2xl">
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-center">
          <img
            src="/board.jpg"
            alt="The Landlord's Game board"
            className="mx-auto w-full max-w-sm rounded-lg shadow-2xl ring-1 ring-black/40 md:max-w-none"
          />
          <div>
            <h1
              className="text-3xl font-bold leading-tight"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              The Landlord&rsquo;s Game
            </h1>
            <p className="mt-1 text-sm text-[#f4ecd6]/60">
              Lizzie Magie&rsquo;s 1906 anti-monopoly classic &mdash; the ancestor of Monopoly.
              Tour the board, draw your wages from Mother Earth, and grow the richest while the
              rents pile up.
            </p>

            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-[#f4ecd6]/50">Players</div>
              <div className="mt-1.5 flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`h-10 w-12 rounded-md font-semibold transition ${
                      count === n
                        ? 'bg-amber-500 text-[#1d2a23]'
                        : 'border border-[#f4ecd6]/25 hover:bg-[#f4ecd6]/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="self-center text-xs text-[#f4ecd6]/50">
                  start with ${count <= 2 ? 600 : count === 3 ? 500 : 400} each
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full border border-white/60"
                    style={{ background: TOKEN_COLORS[i] }}
                  />
                  <input
                    value={names[i]}
                    onChange={(e) => {
                      const next = [...names]
                      next[i] = e.target.value
                      setNames(next)
                    }}
                    className="flex-1 rounded-md border border-[#f4ecd6]/20 bg-[#26352c] px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() =>
                onStart(
                  Array.from({ length: count }).map((_, i) => ({
                    name: names[i]?.trim() || `Player ${i + 1}`,
                    color: TOKEN_COLORS[i],
                  })),
                )
              }
              className="mt-5 w-full rounded-md bg-amber-500 py-3 font-bold text-[#1d2a23] transition hover:bg-amber-400"
            >
              Begin the Game
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
