export type ItemId = 'spark' | 'pebble' | 'gust' | 'bubble' | 'bloom'

export type ItemInfo = {
  id: ItemId
  name: string
  hint: string
  color: string
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  spark: { id: 'spark', name: 'Spark Coil', hint: 'A bright speed burst', color: '#ffd23f' },
  pebble: { id: 'pebble', name: 'Pebble Pop', hint: 'Drops a bouncing bumper', color: '#9aa5b1' },
  gust: { id: 'gust', name: 'Gust Orb', hint: 'A homing puff that spins rivals', color: '#4cc9f0' },
  bubble: { id: 'bubble', name: 'Bubble Wrap', hint: 'Soaks one hit', color: '#b8fff0' },
  bloom: { id: 'bloom', name: 'Nova Bloom', hint: 'Invincible dash', color: '#ff5db1' }
}

const ORDER: ItemId[] = ['pebble', 'spark', 'bubble', 'gust', 'bloom']

/** Later places pull stronger items. `luck` nudges the rare bloom. */
export function rollItem(place: number, luck: number, rand: () => number): ItemId {
  const behind = clamp01((place - 1) / 7)
  const weights: Record<ItemId, number> = {
    pebble: 1.35 - behind * 0.7,
    spark: 1.05,
    bubble: 0.85,
    gust: 0.35 + behind * 1.45,
    bloom: (0.06 + behind * behind * 1.15) * luck
  }
  let total = 0
  for (const id of ORDER) total += weights[id]
  let roll = rand() * total
  for (const id of ORDER) {
    roll -= weights[id]
    if (roll <= 0) return id
  }
  return 'spark'
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
