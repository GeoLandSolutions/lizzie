import type { Space } from './types'

// Bounding boxes taken from a vision analysis of the real 1906 Economic Game Co.
// board photo (public/board.jpg). Each box_2d is [y1, x1, y2, x2] on a 0..1000
// scale. We convert to percent {x,y,w,h} so overlays sit on the actual artwork.
function box(b: [number, number, number, number]) {
  const [y1, x1, y2, x2] = b
  return { x: x1 / 10, y: y1 / 10, w: (x2 - x1) / 10, h: (y2 - y1) / 10 }
}

// Colour groups for lots — purely cosmetic ownership tags, keyed by price tier.
export const GROUPS: Record<string, { ring: string; label: string }> = {
  slum: { ring: '#7c4a1e', label: 'The Slums ($25)' },
  working: { ring: '#2f8f5b', label: 'Working District ($50)' },
  uptown: { ring: '#e08a2b', label: 'Uptown ($75)' },
  avenue: { ring: '#2f6fb0', label: 'The Avenues ($100)' },
  rail: { ring: '#c0392b', label: 'Franchises' },
  util: { ring: '#d4a017', label: 'Utilities' },
}

// index 0 == START (Mother Earth, printed #40). Indices 1..39 follow clockwise.
export const BOARD: Space[] = [
  { index: 0, pos: 40, type: 'start', name: 'Mother Earth', subtitle: 'Start — Collect Wages $100', box: box([785, 785, 985, 985]) },
  { index: 1, pos: 1, type: 'property', name: 'Wayback', price: 25, rent: 0, group: 'slum', box: box([785, 722, 950, 785]) },
  { index: 2, pos: 2, type: 'tax', name: 'Fuel', subtitle: 'Absolute Necessity', tax: 10, box: box([785, 658, 950, 722]) },
  { index: 3, pos: 3, type: 'property', name: 'Lonely Lane', price: 25, rent: 2, group: 'slum', box: box([785, 595, 950, 658]) },
  { index: 4, pos: 4, type: 'gotojail', name: 'No Trespassing', subtitle: "Hogg's Game Preserves — Go to Jail", box: box([785, 532, 950, 595]) },
  { index: 5, pos: 5, type: 'railroad', name: 'Royal Rusher R.R.', price: 50, group: 'rail', box: box([785, 468, 950, 532]) },
  { index: 6, pos: 6, type: 'property', name: 'The Pike', price: 25, rent: 4, group: 'slum', box: box([785, 405, 950, 468]) },
  { index: 7, pos: 7, type: 'property', name: 'The Farm', price: 25, rent: 4, group: 'slum', box: box([785, 342, 950, 405]) },
  { index: 8, pos: 8, type: 'property', name: 'Speculation', subtitle: 'Mr. J.B. Sharp, Broker', price: 50, rent: 10, group: 'working', box: box([785, 278, 950, 342]) },
  { index: 9, pos: 9, type: 'property', name: 'Rubeville', price: 25, rent: 6, group: 'slum', box: box([785, 215, 950, 278]) },
  { index: 10, pos: 10, type: 'jail', name: 'Jail', subtitle: 'Shelter — Just Visiting', box: box([785, 15, 978, 215]) },
  { index: 11, pos: 11, type: 'property', name: 'Boomtown', price: 50, rent: 6, group: 'working', box: box([722, 15, 785, 215]) },
  { index: 12, pos: 12, type: 'property', name: 'Goat Alley', price: 50, rent: 8, group: 'working', box: box([658, 15, 722, 215]) },
  { index: 13, pos: 13, type: 'utility', name: 'Soakum Lighting', subtitle: 'Lighting System', price: 50, group: 'util', box: box([595, 15, 658, 215]) },
  { index: 14, pos: 14, type: 'property', name: "Beggarman's Court", price: 50, rent: 8, group: 'working', box: box([532, 15, 595, 215]) },
  { index: 15, pos: 15, type: 'railroad', name: 'Shooting Star R.R.', price: 50, group: 'rail', box: box([468, 15, 532, 215]) },
  { index: 16, pos: 16, type: 'property', name: 'Rickety Row', price: 50, rent: 10, group: 'working', box: box([405, 15, 468, 215]) },
  { index: 17, pos: 17, type: 'tax', name: 'Food', subtitle: 'Absolute Necessity', tax: 10, box: box([342, 15, 405, 215]) },
  { index: 18, pos: 18, type: 'property', name: 'Market Place', price: 50, rent: 10, group: 'working', box: box([278, 15, 342, 215]) },
  { index: 19, pos: 19, type: 'property', name: 'Cottage Terrace', price: 50, rent: 12, group: 'working', box: box([215, 15, 278, 215]) },
  { index: 20, pos: 20, type: 'poorhouse', name: 'Poorhouse', subtitle: 'Central Park — Free Resting', box: box([15, 15, 215, 215]) },
  { index: 21, pos: 21, type: 'property', name: 'Easy Street', price: 75, rent: 12, group: 'uptown', box: box([15, 215, 215, 278]) },
  { index: 22, pos: 22, type: 'chance', name: 'Chance', box: box([15, 278, 215, 342]) },
  { index: 23, pos: 23, type: 'property', name: 'George Street', price: 75, rent: 14, group: 'uptown', box: box([15, 342, 215, 405]) },
  { index: 24, pos: 24, type: 'property', name: 'Maguire Flats', price: 75, rent: 14, group: 'uptown', box: box([15, 405, 215, 468]) },
  { index: 25, pos: 25, type: 'railroad', name: 'Gee Whiz R.R.', price: 50, group: 'rail', box: box([15, 468, 215, 532]) },
  { index: 26, pos: 26, type: 'property', name: 'Fairhope Avenue', price: 75, rent: 16, group: 'uptown', box: box([15, 532, 215, 595]) },
  { index: 27, pos: 27, type: 'utility', name: 'Slambang Trolley', subtitle: 'Transit System', price: 50, group: 'util', box: box([15, 595, 215, 658]) },
  { index: 28, pos: 28, type: 'property', name: 'Johnson Circle', price: 75, rent: 16, group: 'uptown', box: box([15, 658, 215, 722]) },
  { index: 29, pos: 29, type: 'property', name: 'The Bowery', price: 75, rent: 18, group: 'uptown', box: box([15, 722, 215, 785]) },
  { index: 30, pos: 30, type: 'gotojail', name: 'No Trespassing', subtitle: "Lord Blueblood's Estate — Go to Jail", box: box([15, 785, 215, 985]) },
  { index: 31, pos: 31, type: 'property', name: 'Broadway', price: 100, rent: 18, group: 'avenue', box: box([215, 785, 278, 985]) },
  { index: 32, pos: 32, type: 'tax', name: 'Clothing', subtitle: 'Absolute Necessity', tax: 10, box: box([278, 785, 342, 985]) },
  { index: 33, pos: 33, type: 'property', name: 'Madison Square', price: 100, rent: 20, group: 'avenue', box: box([342, 785, 405, 985]) },
  { index: 34, pos: 34, type: 'property', name: 'Fifth Avenue', price: 100, rent: 20, group: 'avenue', box: box([405, 785, 468, 985]) },
  { index: 35, pos: 35, type: 'railroad', name: 'P.D.Q. R.R.', price: 50, group: 'rail', box: box([468, 785, 532, 985]) },
  { index: 36, pos: 36, type: 'property', name: 'Grand Boulevard', price: 100, rent: 22, group: 'avenue', box: box([532, 785, 595, 985]) },
  { index: 37, pos: 37, type: 'chance', name: 'Chance', box: box([595, 785, 658, 985]) },
  { index: 38, pos: 38, type: 'property', name: 'Wall Street', price: 100, rent: 22, group: 'avenue', box: box([658, 785, 722, 985]) },
  { index: 39, pos: 39, type: 'luxury', name: 'Luxury', subtitle: 'Pay $75 — worth 100 pts', tax: 75, box: box([722, 785, 785, 985]) },
]

export const START_INDEX = 0
export const JAIL_INDEX = 10
export const WAGES = 100
export const HOUSE_COST = 100
export const HOUSE_RENT = 10
export const MAX_HOUSES = 3
export const JAIL_FINE = 50
export const LUXURY_FEE = 75
export const WAGES_TO_WIN = 5
export const RAIL_FARE = [0, 5, 10, 20, 50] // by count of railroads owned
export const UTIL_RENT_ONE = 5
export const UTIL_RENT_BOTH = 25

export function startingCash(n: number): number {
  if (n <= 2) return 600
  if (n === 3) return 500
  return 400
}
