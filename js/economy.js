/**
 * Coins, the general store, and the bank. No DOM: the browser and the Node tests share it.
 * Prices follow the OSRS general store: the shop sells at an item's value and buys back
 * at 40% of it (rounded down, at least 1 coin). Combat never reads anything here.
 */
import { INVENTORY_SIZE, ITEMS, addItem, getItem, removeAt } from "./items.js";

/** Base value in coins. Bronze and iron follow OSRS store values; the rest sit beside them. */
export const VALUES = Object.freeze({
  bones: 1,
  coins: 1,
  bread: 12,
  "cooked-meat": 4,
  trout: 20,
  "bronze-sword": 26,
  "bronze-staff": 15,
  "bronze-bow": 50,
  "bronze-helm": 24,
  "bronze-body": 80,
  "bronze-legs": 52,
  "bronze-shield": 48,
  "bronze-gloves": 10,
  "bronze-boots": 12,
  "iron-sword": 91,
  "iron-staff": 120,
  "iron-bow": 100,
  "iron-helm": 84,
  "iron-body": 280,
  "iron-legs": 182,
  "iron-shield": 168,
  "iron-gloves": 35,
  "iron-boots": 42,
  dagger: 35,
});

export const SELL_RATE = 0.4;

/** What the general store keeps on its shelves. Stock never runs out. Bows here need no arrows. */
export const SHOP_STOCK = Object.freeze([
  "bronze-sword",
  "bronze-staff",
  "bronze-bow",
  "iron-sword",
  "bronze-helm",
  "bronze-body",
  "bronze-legs",
  "bronze-shield",
  "bronze-gloves",
  "bronze-boots",
  "bread",
]);

/** Distinct stacks the bank will hold. Every item stacks in the bank. */
export const BANK_SIZE = 120;

export function itemValue(itemId) {
  return VALUES[itemId] ?? 0;
}

export function shopPrice(itemId) {
  return itemValue(itemId);
}

export function sellPrice(itemId) {
  if (itemId === "coins" || !getItem(itemId)) return 0;
  return Math.max(1, Math.floor(itemValue(itemId) * SELL_RATE));
}

export function coinCount(inventory) {
  let total = 0;
  for (const slot of inventory || []) if (slot && slot.itemId === "coins") total += slot.qty;
  return total;
}

function cloneSlots(inventory) {
  const slots = [];
  for (let i = 0; i < INVENTORY_SIZE; i += 1) {
    const slot = inventory?.[i];
    slots.push(slot ? { itemId: slot.itemId, qty: slot.qty } : null);
  }
  return slots;
}

function takeCoins(slots, amount) {
  let left = amount;
  for (let i = 0; i < slots.length && left > 0; i += 1) {
    const slot = slots[i];
    if (!slot || slot.itemId !== "coins") continue;
    const take = Math.min(slot.qty, left);
    slot.qty -= take;
    left -= take;
    if (slot.qty <= 0) slots[i] = null;
  }
  return left === 0;
}

/** Buy qty of a shop item. Coins leave first, so spending a whole stack frees its slot. */
export function buyItem(inventory, itemId, qty = 1) {
  const item = getItem(itemId);
  const amount = Math.max(1, Math.floor(qty) || 1);
  if (!item || !SHOP_STOCK.includes(itemId)) return { ok: false, reason: "not-stocked", inventory: cloneSlots(inventory) };
  const cost = shopPrice(itemId) * amount;
  if (coinCount(inventory) < cost) return { ok: false, reason: "coins", cost, inventory: cloneSlots(inventory) };
  const slots = cloneSlots(inventory);
  takeCoins(slots, cost);
  const added = addItem(slots, itemId, amount);
  if (!added.ok) return { ok: false, reason: "full", cost, inventory: cloneSlots(inventory) };
  return { ok: true, cost, item, inventory: added.slots };
}

/** Sell the item in one slot (a whole stack sells together). Coins themselves cannot be sold. */
export function sellAt(inventory, index) {
  const slot = inventory?.[index];
  if (!slot) return { ok: false, reason: "empty", inventory: cloneSlots(inventory) };
  const price = sellPrice(slot.itemId);
  if (!price) return { ok: false, reason: "unsellable", inventory: cloneSlots(inventory) };
  const removed = removeAt(inventory, index);
  const gained = price * removed.qty;
  const paid = addItem(removed.slots, "coins", gained);
  if (!paid.ok) return { ok: false, reason: "full", inventory: cloneSlots(inventory) };
  return { ok: true, gained, item: getItem(slot.itemId), qty: removed.qty, inventory: paid.slots };
}

export function sanitizeBank(raw) {
  const bank = [];
  if (!Array.isArray(raw)) return bank;
  for (const entry of raw) {
    if (!entry || typeof entry.itemId !== "string" || !ITEMS[entry.itemId]) continue;
    const qty = Math.floor(Number(entry.qty));
    if (!Number.isFinite(qty) || qty < 1) continue;
    const existing = bank.find((row) => row.itemId === entry.itemId);
    if (existing) existing.qty += qty;
    else if (bank.length < BANK_SIZE) bank.push({ itemId: entry.itemId, qty });
  }
  return bank;
}

function bankAdd(bank, itemId, qty) {
  const existing = bank.find((row) => row.itemId === itemId);
  if (existing) {
    existing.qty += qty;
    return true;
  }
  if (bank.length >= BANK_SIZE) return false;
  bank.push({ itemId, qty });
  return true;
}

/** Deposit one slot, or with mode "all" every slot holding the same item. */
export function bankDeposit(inventory, bank, index, mode = "one") {
  const slots = cloneSlots(inventory);
  const next = sanitizeBank(bank);
  const slot = slots[index];
  if (!slot) return { ok: false, reason: "empty", inventory: slots, bank: next };
  const itemId = slot.itemId;
  let moved = 0;
  const indices = mode === "all" ? slots.map((s, i) => (s && s.itemId === itemId ? i : -1)).filter((i) => i >= 0) : [index];
  for (const i of indices) {
    if (!bankAdd(next, itemId, slots[i].qty)) {
      return { ok: false, reason: "bank-full", inventory: cloneSlots(inventory), bank: sanitizeBank(bank) };
    }
    moved += slots[i].qty;
    slots[i] = null;
  }
  return { ok: true, itemId, moved, inventory: slots, bank: next };
}

/** Empty the whole pack into the bank. */
export function bankDepositAll(inventory, bank) {
  const slots = cloneSlots(inventory);
  const next = sanitizeBank(bank);
  let moved = 0;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot) continue;
    if (!bankAdd(next, slot.itemId, slot.qty)) continue;
    moved += slot.qty;
    slots[i] = null;
  }
  if (!moved) return { ok: false, reason: slots.some(Boolean) ? "bank-full" : "empty", inventory: slots, bank: next };
  return { ok: true, moved, inventory: slots, bank: next, kept: slots.filter(Boolean).length };
}

/** Withdraw up to qty (Infinity for all) of one bank row. Non-stacking items take a slot each. */
export function bankWithdraw(inventory, bank, bankIndex, qty = 1) {
  const slots = cloneSlots(inventory);
  const next = sanitizeBank(bank);
  const row = next[bankIndex];
  if (!row) return { ok: false, reason: "empty", inventory: slots, bank: next };
  const item = getItem(row.itemId);
  const want = Math.min(row.qty, qty === Infinity ? row.qty : Math.max(1, Math.floor(qty) || 1));
  let taken = 0;
  if (item.stack) {
    const added = addItem(slots, row.itemId, want);
    if (!added.ok) return { ok: false, reason: "full", inventory: slots, bank: next };
    for (let i = 0; i < slots.length; i += 1) slots[i] = added.slots[i];
    taken = want;
  } else {
    for (let n = 0; n < want; n += 1) {
      const free = slots.findIndex((slot) => !slot);
      if (free < 0) break;
      slots[free] = { itemId: row.itemId, qty: 1 };
      taken += 1;
    }
    if (!taken) return { ok: false, reason: "full", inventory: slots, bank: next };
  }
  row.qty -= taken;
  if (row.qty <= 0) next.splice(bankIndex, 1);
  return { ok: true, itemId: row.itemId, taken, partial: taken < want, inventory: slots, bank: next };
}
