// Core types for The Landlord's Game (1906 Economic Game Co. edition)

export type SpaceType =
  | 'start' // Mother Earth — collect wages
  | 'jail' // corner — just visiting / in jail
  | 'poorhouse' // corner — free resting / Central Park
  | 'gotojail' // send player to jail (Hogg's Preserves & Lord Blueblood's Estate)
  | 'property' // a buyable lot
  | 'railroad' // R.R. / trolley franchise
  | 'utility' // lighting / transit utility
  | 'tax' // an Absolute Necessity (Food/Fuel/Clothing/Shelter)
  | 'chance' // draw a red card
  | 'speculation' // Mr. I.B. Sharp, Broker
  | 'luxury' // Luxury — pay $75 for a 100-point card

export interface Space {
  index: number // 0..39, 0 = START (Mother Earth)
  pos: number // printed board number (40 for start, 10/20/30 corners)
  type: SpaceType
  name: string
  subtitle?: string
  price?: number // purchase price for property/railroad/utility
  rent?: number // base land rent for a property
  tax?: number // amount for a tax space
  group?: string // cosmetic colour-group key for lots
  // overlay box on the real board image, in percent (0..100) of image size.
  // Derived from the antique board photo: x,y = top-left corner, w,h = size.
  box: { x: number; y: number; w: number; h: number }
}

export interface SpaceState {
  ownerId: number | null
  houses: number // 0..3, lots only
}

export interface Player {
  id: number
  name: string
  color: string // token colour (hex)
  cash: number
  pos: number // space index 0..39
  inJail: boolean
  jailTurns: number
  wages: number // times wages collected (game ends at 5)
  luxury: number // luxury cards held (100 pts each)
  bankrupt: boolean
  auto: boolean // play this seat autonomously
}

export type Phase = 'setup' | 'roll' | 'jail' | 'action' | 'gameover'

export interface ChanceCard {
  text: string
  apply: (s: GameState) => GameState
}

export interface GameState {
  players: Player[]
  current: number // index into players
  spaces: SpaceState[]
  dice: [number, number] | null
  isDouble: boolean
  doublesUsed: boolean // already took the bonus roll this turn
  phase: Phase
  pendingBuy: number | null // space index the current player may buy
  log: LogEntry[]
  winnerId: number | null
  rollCount: number // increments on every dice roll (drives the dice animation)
  lvt: boolean // Land Value Tax (single-tax) mode — the commonwealth ruleset
  treasury: number // the Public Treasury / common fund (grows under LVT)
  events: GameEvent[] // animation script produced by the most recent action
  eventSeq: number // bumps every action so the UI knows a fresh script arrived
}

export interface LogEntry {
  id: number
  text: string
  kind?: 'money' | 'move' | 'event' | 'system'
}

// ---- animation events: a script the UI replays to tell the turn's story ----
export type MoneyAnchor = { kind: 'player'; id: number } | { kind: 'center' }

export type ChanceVariant = 'jail' | 'move' | 'gain' | 'pay' | 'lots'

export type GameEvent =
  | { id: number; kind: 'move'; playerId: number; path: number[]; teleport?: boolean }
  | {
      id: number
      kind: 'money'
      amount: number
      from: MoneyAnchor
      to: MoneyAnchor
      dividend?: boolean // LVT public dividend — slow, celebratory payout
    }
  | { id: number; kind: 'buy'; playerId: number; space: number }
  | { id: number; kind: 'jail'; playerId: number }
  | { id: number; kind: 'chance'; playerId: number; text: string; variant: ChanceVariant }
  | { id: number; kind: 'roll'; dice: [number, number] }
