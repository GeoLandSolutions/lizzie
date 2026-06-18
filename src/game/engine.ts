import {
  BOARD,
  JAIL_INDEX,
  START_INDEX,
  WAGES,
  HOUSE_COST,
  HOUSE_RENT,
  MAX_HOUSES,
  JAIL_FINE,
  LUXURY_FEE,
  WAGES_TO_WIN,
  RAIL_FARE,
  UTIL_RENT_ONE,
  UTIL_RENT_BOTH,
  startingCash,
} from './board'
import type { GameEvent, GameState, LogEntry, MoneyAnchor, Player, Space } from './types'

export const TOKEN_COLORS = [
  '#c0392b', // red
  '#2f6fb0', // blue
  '#2f8f5b', // green
  '#d4a017', // gold
]

export interface ChanceEffect {
  text: string
  k:
    | 'gain'
    | 'pay'
    | 'payPerHouse'
    | 'payPerLot'
    | 'gainPerLot'
    | 'gotoJail'
    | 'advanceStart'
    | 'move'
  n?: number
}

export const CHANCE_DECK: ChanceEffect[] = [
  { text: 'A distant aunt remembers you in her will. Collect $50.', k: 'gain', n: 50 },
  { text: 'The assessor revalues your parlour. Pay $10 to the Public Treasury.', k: 'pay', n: 10 },
  { text: 'Return to Mother Earth and collect your wages.', k: 'advanceStart' },
  { text: 'Lord Blueblood presses charges. Go directly to Jail.', k: 'gotoJail' },
  { text: 'Your speculation in wheat pays off. Collect $25.', k: 'gain', n: 25 },
  { text: 'Tenement repairs ordered by the city. Pay $10 per house you own.', k: 'payPerHouse', n: 10 },
  { text: 'The Single Tax is levied on land. Pay $5 for each lot you hold.', k: 'payPerLot', n: 5 },
  { text: 'The trolley speeds you along. Advance 3 spaces.', k: 'move', n: 3 },
  { text: 'Caught cutting across the estate — go back 3 spaces.', k: 'move', n: -3 },
  { text: "Doctor's bill from the dispensary. Pay $15.", k: 'pay', n: 15 },
  { text: 'A reform landlord refunds your rent. Collect $20.', k: 'gain', n: 20 },
  { text: 'Ground rents come due in your favour. Collect $5 per lot you own.', k: 'gainPerLot', n: 5 },
  { text: 'Charity drive for the Poorhouse. Pay $20.', k: 'pay', n: 20 },
  { text: 'You strike oil on the back forty! Collect $100.', k: 'gain', n: 100 },
]

function chanceVariant(k: ChanceEffect['k']): import('./types').ChanceVariant {
  if (k === 'gotoJail') return 'jail'
  if (k === 'advanceStart' || k === 'move') return 'move'
  if (k === 'payPerHouse' || k === 'payPerLot' || k === 'gainPerLot') return 'lots'
  if (k === 'gain') return 'gain'
  return 'pay'
}

export type Action =
  | { t: 'setup'; players: Array<{ name: string; color: string }> }
  | { t: 'roll' }
  | { t: 'payJail' }
  | { t: 'buy' }
  | { t: 'skipBuy' }
  | { t: 'build'; index: number }
  | { t: 'sell'; index: number }
  | { t: 'endTurn' }
  | { t: 'toggleAuto'; id: number }
  | { t: 'toggleLVT' }
  | { t: 'newGame' }

// ---- helpers ---------------------------------------------------------------

let evSeq = 1

function log(s: GameState, text: string, kind?: LogEntry['kind']) {
  // derive id from existing log so keys stay unique across HMR reloads
  const id = (s.log[0]?.id ?? 0) + 1
  s.log.unshift({ id, text, kind })
  if (s.log.length > 80) s.log.length = 80
}

type DistOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never
function emit(s: GameState, e: DistOmit<GameEvent, 'id'>) {
  s.events.push({ id: evSeq++, ...e } as GameEvent)
}

// thematic money flow: from a player / the central treasury to another
function money(
  s: GameState,
  amount: number,
  from: MoneyAnchor,
  to: MoneyAnchor,
  opts?: { dividend?: boolean },
) {
  if (amount > 0) emit(s, { kind: 'money', amount, from, to, ...opts })
}
const CENTER: MoneyAnchor = { kind: 'center' }
const at = (id: number): MoneyAnchor => ({ kind: 'player', id })

function cur(s: GameState): Player {
  return s.players[s.current]
}

export function lotsOwned(s: GameState, pid: number): number[] {
  return BOARD.filter((sp) => sp.type === 'property' && s.spaces[sp.index].ownerId === pid).map(
    (sp) => sp.index,
  )
}

export function housesOwned(s: GameState, pid: number): number {
  return BOARD.reduce(
    (sum, sp) => sum + (s.spaces[sp.index].ownerId === pid ? s.spaces[sp.index].houses : 0),
    0,
  )
}

function countType(s: GameState, pid: number, type: Space['type']): number {
  return BOARD.filter((sp) => sp.type === type && s.spaces[sp.index].ownerId === pid).length
}

export function netWorth(s: GameState, pid: number): number {
  let total = s.players[pid].cash + s.players[pid].luxury * 100
  for (const sp of BOARD) {
    const st = s.spaces[sp.index]
    if (st.ownerId === pid) {
      total += sp.price ?? 0
      total += st.houses * HOUSE_COST
    }
  }
  return total
}

// raise cash by selling houses (half price) before going bankrupt
function raiseCash(s: GameState, p: Player, need: number) {
  if (p.cash >= need) return
  for (const idx of lotsOwned(s, p.id)) {
    while (p.cash < need && s.spaces[idx].houses > 0) {
      s.spaces[idx].houses--
      p.cash += Math.floor(HOUSE_COST / 2)
      log(s, `${p.name} sells a house on ${BOARD[idx].name} for $${Math.floor(HOUSE_COST / 2)}.`, 'money')
    }
    if (p.cash >= need) break
  }
}

// pay `amount` from player p; creditorId null = the Public Treasury (bank)
function pay(s: GameState, p: Player, amount: number, creditorId: number | null) {
  if (amount <= 0) return
  money(s, amount, at(p.id), creditorId != null ? at(creditorId) : CENTER)
  if (p.cash < amount) raiseCash(s, p, amount)
  if (p.cash < amount) {
    // bankruptcy
    const owed = p.cash
    if (creditorId != null) {
      s.players[creditorId].cash += owed
    }
    p.cash = 0
    p.bankrupt = true
    // release holdings back to the Treasury
    for (const sp of BOARD) {
      if (s.spaces[sp.index].ownerId === p.id) {
        s.spaces[sp.index].ownerId = null
        s.spaces[sp.index].houses = 0
      }
    }
    log(s, `${p.name} is ruined and retires to the Poorhouse. Holdings revert to the Treasury.`, 'event')
    return
  }
  p.cash -= amount
  if (creditorId != null) s.players[creditorId].cash += amount
}

function collect(s: GameState, p: Player, amount: number) {
  p.cash += amount
  money(s, amount, CENTER, at(p.id))
}

function activePlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.bankrupt)
}

// award wages, and — under Land Value Tax — pay a citizen's dividend to all
function grantWages(s: GameState, p: Player, msg: string) {
  p.cash += WAGES
  p.wages++
  log(s, msg, 'money')
  money(s, WAGES, CENTER, at(p.id))
  if (s.lvt && s.treasury > 0) {
    const actives = activePlayers(s)
    const share = Math.floor(s.treasury / actives.length)
    if (share > 0) {
      actives.forEach((a) => {
        a.cash += share
        money(s, share, CENTER, at(a.id), { dividend: true })
      })
      s.treasury -= share * actives.length
      log(
        s,
        `☀ Public dividend! The common treasury pays $${share} to every citizen.`,
        'system',
      )
    }
  }
}

function goToJail(s: GameState, p: Player) {
  p.pos = JAIL_INDEX
  p.inJail = true
  p.jailTurns = 0
  emit(s, { kind: 'move', playerId: p.id, path: [JAIL_INDEX], teleport: true })
  emit(s, { kind: 'jail', playerId: p.id })
  log(s, `${p.name} is sent to Jail.`, 'event')
}

function checkGameOver(s: GameState): boolean {
  const alive = activePlayers(s)
  if (alive.length <= 1 && s.players.length > 1) {
    s.phase = 'gameover'
    s.winnerId = alive.length === 1 ? alive[0].id : null
    return true
  }
  const wageWinner = s.players.find((p) => p.wages >= WAGES_TO_WIN)
  if (wageWinner) {
    s.phase = 'gameover'
    // highest net worth among everyone wins
    let best = -Infinity
    let bestId = wageWinner.id
    for (const p of s.players) {
      const nw = netWorth(s, p.id)
      if (nw > best) {
        best = nw
        bestId = p.id
      }
    }
    s.winnerId = bestId
    log(s, `${wageWinner.name} has drawn wages ${WAGES_TO_WIN} times — the game ends!`, 'system')
    return true
  }
  return false
}

// move current player forward by `steps`, awarding wages when passing Start
function advance(s: GameState, p: Player, steps: number) {
  const before = p.pos
  let next = (before + steps) % BOARD.length
  if (next < 0) next += BOARD.length
  // record the step-by-step path so the token can hop along it
  const path: number[] = []
  const dir = steps >= 0 ? 1 : -1
  for (let k = 1; k <= Math.abs(steps); k++) {
    path.push(((before + dir * k) % BOARD.length + BOARD.length) % BOARD.length)
  }
  if (path.length) emit(s, { kind: 'move', playerId: p.id, path })
  // passing or landing on Start (only when moving forward)
  if (steps > 0 && (before + steps >= BOARD.length || next === START_INDEX)) {
    // landing exactly on start is handled in resolve; passing awards wages here
    if (next !== START_INDEX) {
      grantWages(s, p, `${p.name} labours past Mother Earth and collects $${WAGES} in wages.`)
    }
  }
  p.pos = next
}

// resolve the tile the current player has landed on
function resolveLanding(s: GameState, allowChance = true) {
  const p = cur(s)
  const sp = BOARD[p.pos]
  s.pendingBuy = null

  switch (sp.type) {
    case 'start': {
      grantWages(s, p, `${p.name} arrives at Mother Earth and draws $${WAGES} in wages.`)
      break
    }
    case 'poorhouse':
      log(s, `${p.name} rests in Central Park — no charge.`, 'move')
      break
    case 'jail':
      log(s, `${p.name} is just visiting the Jail.`, 'move')
      break
    case 'gotojail':
      goToJail(s, p)
      break
    case 'tax':
      if (s.lvt) {
        log(
          s,
          `${p.name} reaches ${sp.name} — under the Single Tax, life's necessities are free.`,
          'system',
        )
      } else {
        log(s, `${p.name} pays $${sp.tax} for ${sp.name} (an Absolute Necessity).`, 'money')
        pay(s, p, sp.tax ?? 0, null)
      }
      break
    case 'luxury':
      if (p.cash >= LUXURY_FEE) {
        pay(s, p, LUXURY_FEE, null)
        p.luxury++
        log(s, `${p.name} indulges in Luxury for $${LUXURY_FEE} (worth 100 pts at game's end).`, 'money')
      } else {
        log(s, `${p.name} cannot afford Luxury and passes it by.`, 'move')
      }
      break
    case 'chance': {
      if (!allowChance) break
      const card = CHANCE_DECK[Math.floor(Math.random() * CHANCE_DECK.length)]
      log(s, `Chance: ${card.text}`, 'event')
      emit(s, { kind: 'chance', playerId: p.id, text: card.text, variant: chanceVariant(card.k) })
      applyChance(s, p, card)
      break
    }
    case 'property':
    case 'railroad':
    case 'utility': {
      const st = s.spaces[sp.index]
      if (st.ownerId === null) {
        if (p.cash >= (sp.price ?? 0)) {
          s.pendingBuy = sp.index // offer purchase
        } else {
          log(s, `${p.name} lands on ${sp.name} but cannot afford the $${sp.price}.`, 'move')
        }
      } else if (st.ownerId === p.id) {
        log(s, `${p.name} rests on their own ${sp.name}.`, 'move')
      } else {
        const owner = s.players[st.ownerId]
        const rent = rentFor(s, sp.index)
        if (s.lvt) {
          log(
            s,
            `${p.name} pays $${rent} land rent on ${sp.name} into the Public Treasury.`,
            'money',
          )
          pay(s, p, rent, null)
          if (!p.bankrupt) s.treasury += rent
        } else {
          log(s, `${p.name} pays $${rent} rent to ${owner.name} for ${sp.name}.`, 'money')
          pay(s, p, rent, owner.id)
        }
      }
      break
    }
  }
  checkGameOver(s)
}

export function rentFor(s: GameState, index: number): number {
  const sp = BOARD[index]
  const st = s.spaces[index]
  if (st.ownerId === null) return 0
  if (sp.type === 'property') return (sp.rent ?? 0) + st.houses * HOUSE_RENT
  if (sp.type === 'railroad') {
    const n = countType(s, st.ownerId, 'railroad')
    return RAIL_FARE[Math.min(n, RAIL_FARE.length - 1)]
  }
  if (sp.type === 'utility') {
    const n = countType(s, st.ownerId, 'utility')
    return n >= 2 ? UTIL_RENT_BOTH : UTIL_RENT_ONE
  }
  return 0
}

function applyChance(s: GameState, p: Player, card: ChanceEffect) {
  switch (card.k) {
    case 'gain':
      collect(s, p, card.n ?? 0)
      break
    case 'pay':
      pay(s, p, card.n ?? 0, null)
      break
    case 'payPerHouse':
      pay(s, p, (card.n ?? 0) * housesOwned(s, p.id), null)
      break
    case 'payPerLot':
      pay(s, p, (card.n ?? 0) * lotsOwned(s, p.id).length, null)
      break
    case 'gainPerLot':
      collect(s, p, (card.n ?? 0) * lotsOwned(s, p.id).length)
      break
    case 'gotoJail':
      goToJail(s, p)
      break
    case 'advanceStart':
      p.pos = START_INDEX
      emit(s, { kind: 'move', playerId: p.id, path: [START_INDEX], teleport: true })
      grantWages(s, p, `${p.name} collects $${WAGES} in wages.`)
      break
    case 'move': {
      advance(s, p, card.n ?? 0)
      resolveLanding(s, false) // resolve the new tile, but don't chain another Chance
      break
    }
  }
}

// ---- public reducer --------------------------------------------------------

export function createInitialState(): GameState {
  return {
    players: [],
    current: 0,
    spaces: BOARD.map(() => ({ ownerId: null, houses: 0 })),
    dice: null,
    isDouble: false,
    doublesUsed: false,
    phase: 'setup',
    pendingBuy: null,
    log: [],
    winnerId: null,
    rollCount: 0,
    lvt: false,
    treasury: 0,
    events: [],
    eventSeq: 0,
  }
}

function beginTurn(s: GameState) {
  const p = cur(s)
  s.dice = null
  s.pendingBuy = null
  s.doublesUsed = false
  s.isDouble = false
  s.phase = p.inJail ? 'jail' : 'roll'
}

function nextPlayer(s: GameState) {
  if (s.phase === 'gameover') return
  let i = s.current
  for (let k = 0; k < s.players.length; k++) {
    i = (i + 1) % s.players.length
    if (!s.players[i].bankrupt) break
  }
  s.current = i
  beginTurn(s)
}

export function reducer(state: GameState, action: Action): GameState {
  const s: GameState = structuredClone(state)
  // start a fresh animation script for this action
  s.events = []
  s.eventSeq = state.eventSeq + 1
  switch (action.t) {
    case 'setup': {
      const cash = startingCash(action.players.length)
      s.players = action.players.map((pl, i) => ({
        id: i,
        name: pl.name,
        color: pl.color,
        cash,
        pos: START_INDEX,
        inJail: false,
        jailTurns: 0,
        wages: 0,
        luxury: 0,
        bankrupt: false,
        auto: true,
      }))
      s.spaces = BOARD.map(() => ({ ownerId: null, houses: 0 }))
      s.current = 0
      s.log = []
      s.winnerId = null
      log(s, `A new game begins. Each labourer starts with $${cash}.`, 'system')
      beginTurn(s)
      return s
    }

    case 'roll': {
      if (s.phase !== 'roll' && s.phase !== 'jail' && !(s.phase === 'action' && s.isDouble))
        return state
      const p = cur(s)
      const d1 = 1 + Math.floor(Math.random() * 6)
      const d2 = 1 + Math.floor(Math.random() * 6)
      s.dice = [d1, d2]
      s.rollCount++
      emit(s, { kind: 'roll', dice: [d1, d2] })
      const sum = d1 + d2
      const isDouble = d1 === d2
      s.isDouble = isDouble

      // --- rolling while in Jail ---
      if (p.inJail) {
        if (isDouble) {
          p.inJail = false
          p.jailTurns = 0
          log(s, `${p.name} rolls doubles (${d1}+${d2}) and walks free!`, 'event')
          advance(s, p, sum)
          resolveLanding(s)
          s.isDouble = false // no bonus roll out of jail
          if ((s.phase as string) !== 'gameover') s.phase = 'action'
        } else {
          p.jailTurns++
          if (p.jailTurns >= 3) {
            log(s, `${p.name} fails a third time and must post the $${JAIL_FINE} fine.`, 'money')
            pay(s, p, JAIL_FINE, null)
            p.inJail = false
            p.jailTurns = 0
            if (!p.bankrupt) {
              advance(s, p, sum)
              resolveLanding(s)
            }
            if ((s.phase as string) !== 'gameover') s.phase = 'action'
          } else {
            log(s, `${p.name} rolls ${d1}+${d2} — no doubles, stays in Jail.`, 'move')
            s.phase = 'action' // only option will be End Turn
          }
        }
        checkGameOver(s)
        return s
      }

      // --- normal roll ---
      log(s, `${p.name} rolls ${d1} + ${d2} = ${sum}${isDouble ? ' (doubles!)' : ''}.`, 'move')
      advance(s, p, sum)
      resolveLanding(s)
      if ((s.phase as string) !== 'gameover') s.phase = 'action'
      if (isDouble) s.doublesUsed = true
      return s
    }

    case 'payJail': {
      if (s.phase !== 'jail') return state
      const p = cur(s)
      pay(s, p, JAIL_FINE, null)
      if (!p.bankrupt) {
        p.inJail = false
        p.jailTurns = 0
        log(s, `${p.name} posts $${JAIL_FINE} bail and is free to roll.`, 'money')
        s.phase = 'roll'
      } else {
        s.phase = 'action'
      }
      checkGameOver(s)
      return s
    }

    case 'buy': {
      if (s.pendingBuy == null) return state
      const idx = s.pendingBuy
      const sp = BOARD[idx]
      const p = cur(s)
      if (p.cash < (sp.price ?? 0)) return state
      pay(s, p, sp.price ?? 0, null)
      s.spaces[idx].ownerId = p.id
      s.pendingBuy = null
      emit(s, { kind: 'buy', playerId: p.id, space: idx })
      log(s, `${p.name} buys ${sp.name} for $${sp.price}.`, 'money')
      return s
    }

    case 'skipBuy': {
      if (s.pendingBuy == null) return state
      log(s, `${cur(s).name} declines to buy ${BOARD[s.pendingBuy].name}.`, 'move')
      s.pendingBuy = null
      return s
    }

    case 'build': {
      if (s.phase !== 'action') return state
      const p = cur(s)
      const st = s.spaces[action.index]
      const sp = BOARD[action.index]
      if (sp.type !== 'property' || st.ownerId !== p.id) return state
      if (st.houses >= MAX_HOUSES || p.cash < HOUSE_COST) return state
      pay(s, p, HOUSE_COST, null)
      st.houses++
      log(s, `${p.name} builds a house on ${sp.name} (rent now $${rentFor(s, action.index)}).`, 'money')
      return s
    }

    case 'sell': {
      const p = cur(s)
      const st = s.spaces[action.index]
      const sp = BOARD[action.index]
      if (sp.type !== 'property' || st.ownerId !== p.id || st.houses <= 0) return state
      st.houses--
      p.cash += Math.floor(HOUSE_COST / 2)
      log(s, `${p.name} sells a house on ${sp.name} for $${Math.floor(HOUSE_COST / 2)}.`, 'money')
      return s
    }

    case 'endTurn': {
      if (s.phase !== 'action') return state
      // a non-jail double earns another roll instead of ending
      if (s.isDouble && !cur(s).inJail && !cur(s).bankrupt) {
        s.isDouble = false
        s.phase = 'roll'
        s.dice = null
        log(s, `${cur(s).name} rolled doubles — roll again!`, 'system')
        return s
      }
      nextPlayer(s)
      return s
    }

    case 'toggleAuto': {
      const pl = s.players[action.id]
      if (!pl) return state
      pl.auto = !pl.auto
      log(s, `${pl.name} is now played ${pl.auto ? 'automatically' : 'by hand'}.`, 'system')
      return s
    }

    case 'toggleLVT': {
      s.lvt = !s.lvt
      if (s.lvt) {
        log(
          s,
          `✦ Land Value Tax enacted! Land rents now flow to the common Treasury and back to all. Everything gets better.`,
          'system',
        )
      } else {
        // disbanding the commons — split whatever remains among the living
        if (s.treasury > 0) {
          const actives = activePlayers(s)
          const share = Math.floor(s.treasury / actives.length)
          actives.forEach((a) => {
            a.cash += share
            money(s, share, CENTER, at(a.id), { dividend: true })
          })
          s.treasury -= share * actives.length
        }
        log(s, `Land Value Tax repealed — the old landlord rules return.`, 'system')
      }
      return s
    }

    case 'newGame': {
      const fresh = createInitialState()
      return fresh
    }
  }
  return s
}
