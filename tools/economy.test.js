/**
 * Coins, the general store, the bank, and save round-trips.
 * Run with: node tools/economy.test.js
 */
import { INVENTORY_SIZE, ITEMS, addItem, emptyInventory, starterState } from "../js/items.js";
import {
  BANK_SIZE,
  SHOP_STOCK,
  VALUES,
  bankDeposit,
  bankDepositAll,
  bankWithdraw,
  buyItem,
  coinCount,
  sanitizeBank,
  sellAt,
  sellPrice,
  shopPrice,
} from "../js/economy.js";
import { DROP_TABLES } from "../js/items.js";
import { TOWN, ZONES, createWorldGrid, findPath, START, inTown, distanceToRoad } from "../js/nav.js";

// A tiny in-memory localStorage so save.js runs under Node.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const { SAVE_KEY, clearSave, freshSave, loadSave, writeSave } = await import("../js/save.js");

const failures = [];
function assert(cond, message) {
  if (!cond) failures.push(message);
  console.log(`${cond ? "PASS" : "FAIL"}  ${message}`);
}

function bag(...entries) {
  let slots = emptyInventory();
  for (const [itemId, qty] of entries) slots = addItem(slots, itemId, qty).slots;
  return slots;
}
const count = (slots, id) => slots.reduce((n, s) => n + (s && s.itemId === id ? s.qty : 0), 0);
const used = (slots) => slots.filter(Boolean).length;

console.log("Duskmire economy");

// Prices
for (const id of Object.keys(ITEMS)) assert(VALUES[id] > 0, `${ITEMS[id].name} has a coin value`);
for (const id of SHOP_STOCK) {
  assert(Boolean(ITEMS[id]), `Shop stock ${id} is a real item`);
  assert(sellPrice(id) < shopPrice(id), `${ITEMS[id].name} sells back for less than it costs`);
}
assert(sellPrice("coins") === 0, "Coins cannot be sold");
assert(sellPrice("bones") === 1, "Bones fetch a single coin");
assert(sellPrice("bronze-sword") === 10, "A bronze sword sells for 10 (40% of 26)");
assert(sellPrice("iron-body") === 112, "An iron platebody sells for 112 (40% of 280)");
assert(VALUES["iron-sword"] > VALUES["bronze-sword"] && VALUES["iron-body"] > VALUES["bronze-body"], "Iron is worth more than bronze");
assert(["bronze-sword", "bronze-staff", "bronze-bow", "iron-sword", "bronze-helm", "bronze-body"].every((id) => SHOP_STOCK.includes(id)), "The store sells starter weapons and basic armour");
for (const [enemyId, table] of Object.entries(DROP_TABLES)) {
  assert(table.common.some((entry) => entry.itemId === "coins"), `${enemyId} can drop coins`);
}
const goblinCoinMax = DROP_TABLES.goblin.common.find((e) => e.itemId === "coins").qty[1];
assert(shopPrice("bronze-sword") > goblinCoinMax, "A bronze sword costs more than one goblin's best coin drop");

// Buying
let inv = bag(["coins", 30]);
let r = buyItem(inv, "bronze-sword");
assert(r.ok && count(r.inventory, "bronze-sword") === 1, "Buying a bronze sword puts it in the pack");
assert(count(r.inventory, "coins") === 4, "Buying a bronze sword costs 26 coins");
r = buyItem(r.inventory, "bronze-sword");
assert(!r.ok && r.reason === "coins", "Buying without enough coins is refused");
assert(count(r.inventory, "coins") === 4, "A refused purchase keeps the coins");
r = buyItem(bag(["coins", 500]), "iron-body");
assert(!r.ok && r.reason === "not-stocked", "Items off the shelf cannot be bought");
r = buyItem(bag(["coins", 26]), "bronze-sword");
assert(r.ok && count(r.inventory, "coins") === 0 && used(r.inventory) === 1, "Spending the last coins frees their slot for the purchase");
r = buyItem(bag(["coins", 100]), "bread", 3);
assert(r.ok && count(r.inventory, "bread") === 3 && count(r.inventory, "coins") === 64, "Buying three loaves costs 36 coins");

// Full inventory
const full = bag(["coins", 200], ...Array.from({ length: INVENTORY_SIZE - 1 }, () => ["bones", 1]));
assert(used(full) === INVENTORY_SIZE, "Test pack is full");
r = buyItem(full, "bronze-sword");
assert(!r.ok && r.reason === "full", "Buying into a full pack is refused");
assert(count(r.inventory, "coins") === 200, "A full-pack purchase keeps every coin");

// Selling
inv = bag(["bronze-sword", 1], ["coins", 5]);
r = sellAt(inv, 0);
assert(r.ok && r.gained === 10 && count(r.inventory, "coins") === 15, "Selling a bronze sword pays 10 coins onto the stack");
assert(count(r.inventory, "bronze-sword") === 0, "The sold sword leaves the pack");
assert(used(r.inventory) === 1, "Coins still take one slot after a sale");
r = sellAt(bag(["coins", 9]), 0);
assert(!r.ok && r.reason === "unsellable", "The store will not buy coins");
r = sellAt(full, 1);
assert(r.ok && count(r.inventory, "coins") === 201, "Selling from a full pack still pays (coins stack)");
const noCoinsFull = bag(...Array.from({ length: INVENTORY_SIZE }, () => ["bones", 1]));
r = sellAt(noCoinsFull, 3);
assert(r.ok && r.inventory[3]?.itemId === "coins" && r.inventory[3].qty === 1, "Selling the only item in a slot pays into that freed slot");
r = sellAt(bag(), 0);
assert(!r.ok && r.reason === "empty", "Selling an empty slot does nothing");

// Bank deposit and stacking
let bank = [];
inv = bag(["bones", 1], ["bones", 1], ["bones", 1], ["coins", 40], ["bronze-helm", 1]);
r = bankDeposit(inv, bank, 0, "one");
assert(r.ok && r.bank.length === 1 && r.bank[0].qty === 1 && count(r.inventory, "bones") === 2, "Depositing one bone moves one");
r = bankDeposit(r.inventory, r.bank, 1, "all");
assert(r.ok && r.bank[0].qty === 3 && count(r.inventory, "bones") === 0, "Deposit-all-of-kind stacks every bone into one bank row");
const coinIdx = r.inventory.findIndex((s) => s && s.itemId === "coins");
r = bankDeposit(r.inventory, r.bank, coinIdx, "one");
assert(r.ok && r.bank.find((row) => row.itemId === "coins").qty === 40, "Depositing coins moves the whole stack");
inv = addItem(r.inventory, "coins", 15).slots;
r = bankDeposit(inv, r.bank, inv.findIndex((s) => s && s.itemId === "coins"), "one");
assert(r.bank.find((row) => row.itemId === "coins").qty === 55 && r.bank.filter((row) => row.itemId === "coins").length === 1, "Banked coins stack into one row");
r = bankDepositAll(r.inventory, r.bank);
assert(r.ok && used(r.inventory) === 0 && r.bank.find((row) => row.itemId === "bronze-helm")?.qty === 1, "Deposit all empties the pack");
bank = r.bank;
r = bankDepositAll(emptyInventory(), bank);
assert(!r.ok && r.reason === "empty", "Deposit all on an empty pack reports nothing to move");

// Withdraw
const bonesRow = bank.findIndex((row) => row.itemId === "bones");
r = bankWithdraw(emptyInventory(), bank, bonesRow, 2);
assert(r.ok && r.taken === 2 && count(r.inventory, "bones") === 2 && used(r.inventory) === 2, "Withdrawing 2 bones takes two slots");
assert(r.bank[bonesRow].qty === 1, "One bone stays banked");
const coinRow = bank.findIndex((row) => row.itemId === "coins");
r = bankWithdraw(bag(["coins", 5]), bank, coinRow, Infinity);
assert(r.ok && count(r.inventory, "coins") === 60 && used(r.inventory) === 1, "Withdrawn coins join the coin stack in the pack");
assert(!r.bank.some((row) => row.itemId === "coins"), "A fully withdrawn row leaves the bank");
const manyBones = [{ itemId: "bones", qty: 40 }];
r = bankWithdraw(bag(["coins", 1]), manyBones, 0, Infinity);
assert(r.ok && r.partial && r.taken === INVENTORY_SIZE - 1 && r.bank[0].qty === 40 - (INVENTORY_SIZE - 1), "Withdraw-all stops when the pack fills and keeps the rest banked");
r = bankWithdraw(full, manyBones, 0, 1);
assert(!r.ok && r.reason === "full", "Withdrawing into a full pack is refused");
r = bankWithdraw(full, [{ itemId: "coins", qty: 9 }], 0, Infinity);
assert(r.ok && count(r.inventory, "coins") === 209, "Coins can be withdrawn into a full pack that already holds coins");

// Bank limits and sanitising
const crowded = Object.keys(ITEMS).map((itemId) => ({ itemId, qty: 1 }));
assert(sanitizeBank(crowded).length === Object.keys(ITEMS).length, "Every item kind fits in the bank");
assert(BANK_SIZE >= Object.keys(ITEMS).length, "The bank has room for every item kind");
const messy = sanitizeBank([{ itemId: "coins", qty: 5 }, { itemId: "coins", qty: "7" }, { itemId: "nope", qty: 3 }, { itemId: "bones", qty: -1 }, null]);
assert(messy.length === 1 && messy[0].qty === 12, "Bank sanitising merges duplicates and drops junk rows");

// Save round-trips
store.clear();
const blank = loadSave();
assert(Array.isArray(blank.bank) && blank.bank.length === 0, "A fresh save has an empty bank");
const save = freshSave();
save.xp.attack = 1234;
save.inventory = bag(["coins", 77], ["iron-sword", 1], ["trout", 1]);
save.bank = [{ itemId: "coins", qty: 300 }, { itemId: "bronze-body", qty: 2 }];
save.equipment.head = "bronze-helm";
save.x = 4.6;
save.z = 22.2;
save.hp = 7;
save.styleId = "aggressive";
writeSave(save);
assert(store.has(SAVE_KEY), "Writing stores the save under duskmire-save-v1");
const back = loadSave();
assert(back.xp.attack === 1234, "XP survives a reload");
assert(count(back.inventory, "coins") === 77 && count(back.inventory, "iron-sword") === 1 && count(back.inventory, "trout") === 1, "Inventory and coins survive a reload");
assert(back.bank.length === 2 && back.bank[0].qty === 300 && back.bank[1].itemId === "bronze-body", "Bank contents survive a reload");
assert(back.equipment.head === "bronze-helm" && back.equipment.weapon === "bronze-sword", "Equipment survives a reload");
assert(back.x === 4.6 && back.z === 22.2 && back.hp === 7, "Position and health survive a reload");
assert(back.styleId === "aggressive", "Combat style survives a reload");
const legacy = JSON.parse(store.get(SAVE_KEY));
delete legacy.bank;
store.set(SAVE_KEY, JSON.stringify(legacy));
assert(Array.isArray(loadSave().bank) && loadSave().bank.length === 0, "An older save without a bank loads with an empty bank");
legacy.bank = "garbage";
store.set(SAVE_KEY, JSON.stringify(legacy));
assert(loadSave().bank.length === 0, "A corrupt bank field loads as empty");
// A full buy → bank → reload loop.
let loopInv = bag(["coins", 60], ["bones", 1]);
let loopBank = [];
r = sellAt(loopInv, loopInv.findIndex((s) => s && s.itemId === "bones"));
loopInv = r.inventory;
r = buyItem(loopInv, "bronze-sword");
loopInv = r.inventory;
r = bankDeposit(loopInv, loopBank, loopInv.findIndex((s) => s && s.itemId === "bronze-sword"), "one");
loopInv = r.inventory;
loopBank = r.bank;
const loopSave = { ...freshSave(), inventory: loopInv, bank: loopBank };
writeSave(loopSave);
const loopBack = loadSave();
assert(count(loopBack.inventory, "coins") === 35 && loopBack.bank[0]?.itemId === "bronze-sword", "Sell, buy, deposit, reload keeps 35 coins and the banked sword");
clearSave();
assert(!store.has(SAVE_KEY), "Reset clears the stored save");
const fresh = loadSave();
assert(fresh.bank.length === 0 && count(fresh.inventory, "coins") === 0, "After reset the bank and coins start empty");
assert(JSON.stringify(fresh.inventory) === JSON.stringify(starterState().inventory), "After reset the pack is the starter kit");

// The town on the map
const grid = createWorldGrid();
for (const id of ["bank", "shop"]) {
  const spot = TOWN.spots[id];
  const path = findPath(grid, START, spot);
  assert(path.length >= 2, `The ${id} counter can be walked to from the campfire`);
  const end = path[path.length - 1];
  assert(Math.hypot(end.x - spot.x, end.z - spot.z) < 0.9, `The ${id} path ends at the counter`);
  assert(inTown(spot.x, spot.z), `The ${id} counter is inside the town`);
}
assert(!inTown(START.x, START.z), "The campfire is outside the town");
for (const zone of ZONES) {
  assert(Math.hypot(zone.x - TOWN.x, zone.z - TOWN.z) - zone.leash > TOWN.r - 0.5, `${zone.name} foes stay out of town`);
}
assert(distanceToRoad(TOWN.x, TOWN.z) > 3, "The town sits off the main road");

console.log(failures.length ? `\n${failures.length} economy assertion(s) failed.` : "\nAll economy assertions passed.");
if (failures.length) process.exit(1);
