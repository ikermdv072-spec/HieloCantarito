const STORAGE_KEY = "sistema-agua-bidones-v1";
const SUPABASE_CONFIG_KEY = "sistema-agua-bidones-supabase";
const PROTECTED_PASSWORD = "1703215012";
const SUPABASE_URL = "https://ltmcdkhvbybdbfttznnj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWNka2h2YnliZGJmdHR6bm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTM0ODMsImV4cCI6MjA5NjM4OTQ4M30.g63r5e6NQvd8wOrKWXsud-Yq9OITnIVYC_3ZCkTJEYk";

const defaults = {
  config: {
    initialBottles: 349,
    initialCaps: 5500,
    initialLabels: 5700,
    initialSeals: 11000,
    initialGasoline: 0,
    initialDiesel: 0,
    priceDriver: 6,
    priceDriver6: 6,
    priceDriver7: 7,
    priceDirect6: 6,
    priceDirect7: 7,
    priceDirect8: 8,
    priceDirect10: 10,
    gasolineSalePrice: 7,
    costCap: 0.37,
    costLabel: 0.40,
    costSeal: 0.15,
    gasolineLiterCost: 6.96,
    dieselLiterCost: 9.80,
    commission: 0.30,
    productionEmployee1Commission: 0.15,
    productionEmployee2Commission: 0.15,
    monthlyDepreciation: 1000,
    lostCharge: 30,
    lowStock: 500,
    drivers: ["Etenier", "Sebastian", "Freddy", "Chofer random", "Chofer 4", "Chofer 5", "Chofer 6"]
  },
  daily: [],
  purchases: [],
  expenses: [],
  debtPayments: [],
  liabilityDebts: [],
  liabilityPayments: []
};

let state = loadState();
let salesChartInstance = null;
let supabaseConfig = loadSupabaseConfig();
let supabaseClient = null;
let cloudSaveTimer = null;
let applyingCloudState = false;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaults);
  try {
    const parsed = JSON.parse(saved);
    return normalizeState({
      ...structuredClone(defaults),
      ...parsed,
      config: { ...defaults.config, ...(parsed.config || {}) }
    });
  } catch {
    return structuredClone(defaults);
  }
}

function renameDriverKey(map, oldName, newName) {
  if (!map || !(oldName in map)) return map;
  map[newName] = Number(map[newName] || 0) + Number(map[oldName] || 0);
  delete map[oldName];
  return map;
}

function normalizeState(data) {
  data.config.drivers = data.config.drivers || defaults.config.drivers;
  if (data.config.productionEmployee1Commission == null) data.config.productionEmployee1Commission = 0.15;
  if (data.config.productionEmployee2Commission == null) data.config.productionEmployee2Commission = 0.15;
  if (data.config.gasolineLiterCost == null) data.config.gasolineLiterCost = 6.96;
  if (data.config.dieselLiterCost == null) data.config.dieselLiterCost = 9.80;
  if (data.config.initialGasoline == null) data.config.initialGasoline = 0;
  if (data.config.initialDiesel == null) data.config.initialDiesel = 0;
  if (data.config.monthlyDepreciation == null) data.config.monthlyDepreciation = 1000;
  if (data.config.priceDriver6 == null) data.config.priceDriver6 = 6;
  if (data.config.priceDriver7 == null) data.config.priceDriver7 = 7;
  if (data.config.priceDirect6 == null) data.config.priceDirect6 = 6;
  if (data.config.priceDirect10 == null) data.config.priceDirect10 = 10;
  if (data.config.gasolineSalePrice == null) data.config.gasolineSalePrice = 7;
  data.config.commission = Number(data.config.productionEmployee1Commission || 0) + Number(data.config.productionEmployee2Commission || 0);
  data.daily = data.daily || [];
  data.debtPayments = data.debtPayments || [];
  data.liabilityDebts = data.liabilityDebts || [];
  data.liabilityPayments = data.liabilityPayments || [];
  return data;
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipCloud) queueCloudSave();
}

function loadSupabaseConfig() {
  const base = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    table: "water_app_state",
    rowId: "cantaritooo"
  };
  const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!saved) return base;
  try {
    return { ...base, ...JSON.parse(saved), url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  } catch {
    return base;
  }
}

function saveSupabaseConfig() {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(supabaseConfig));
}

function hasSupabaseConfig() {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey && supabaseConfig.table && supabaseConfig.rowId);
}

function getSupabaseClient() {
  if (!hasSupabaseConfig() || !window.supabase) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }
  return supabaseClient;
}

function setSupabaseStatus(text, type = "") {
  const box = document.getElementById("supabaseStatus");
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type}`.trim();
}

function loadSupabaseForm() {
  const fields = {
    supabaseUrl: "url",
    supabaseAnonKey: "anonKey",
    supabaseTable: "table",
    supabaseRowId: "rowId"
  };
  Object.entries(fields).forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (input) input.value = supabaseConfig[key] || "";
  });
  if (hasSupabaseConfig()) {
    setSupabaseStatus("Supabase configurado. Los cambios se guardan también en la nube.", "good");
  } else {
    setSupabaseStatus("Supabase no configurado. El sistema seguirá guardando en este navegador.");
  }
}

function queueCloudSave() {
  if (applyingCloudState || !hasSupabaseConfig()) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => saveToSupabase(), 800);
}

async function saveToSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  const payload = {
    id: supabaseConfig.rowId,
    data: state,
    updated_at: new Date().toISOString()
  };
  setSupabaseStatus("Guardando en Supabase...");
  const { error } = await client
    .from(supabaseConfig.table)
    .upsert(payload, { onConflict: "id" });
  if (error) {
    setSupabaseStatus(`No se pudo guardar en Supabase: ${error.message}`, "bad");
    return;
  }
  setSupabaseStatus(`Guardado en Supabase: ${new Date().toLocaleTimeString("es-BO")}`, "good");
}

async function loadFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  setSupabaseStatus("Cargando datos desde Supabase...");
  const { data, error } = await client
    .from(supabaseConfig.table)
    .select("data, updated_at")
    .eq("id", supabaseConfig.rowId)
    .maybeSingle();
  if (error) {
    setSupabaseStatus(`No se pudo cargar Supabase: ${error.message}`, "bad");
    return;
  }
  if (!data?.data) {
    await saveToSupabase();
    return;
  }
  applyingCloudState = true;
  state = normalizeState({
    ...structuredClone(defaults),
    ...data.data,
    config: { ...defaults.config, ...(data.data.config || {}) }
  });
  saveState({ skipCloud: true });
  applyingCloudState = false;
  renderAll();
  const stamp = data.updated_at ? new Date(data.updated_at).toLocaleString("es-BO") : "sin fecha";
  setSupabaseStatus(`Datos cargados desde Supabase. Última actualización: ${stamp}`, "good");
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} Bs`;
}

function number(value) {
  return Number(value || 0).toLocaleString("es-BO");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dayName(dateIso) {
  if (!dateIso) return "";
  const date = new Date(`${dateIso}T12:00:00`);
  return date.toLocaleDateString("es-BO", { weekday: "long" });
}

function isSunday(dateIso) {
  return new Date(`${dateIso}T12:00:00`).getDay() === 0;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateInRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function isOlderThan4Days(dateIso) {
  if (!dateIso) return false;
  const diff = (new Date(todayIso() + "T12:00:00") - new Date(dateIso + "T12:00:00")) / 86400000;
  return diff >= 4;
}

function confirmProtected() {
  const pwd = prompt("Este registro tiene más de 4 días. Ingresá la contraseña para poder modificarlo:");
  if (pwd === null) return false;
  if (pwd === PROTECTED_PASSWORD) return true;
  alert("Contraseña incorrecta. No se puede modificar el registro.");
  return false;
}

function dashboardRange() {
  return {
    from: document.getElementById("dashFrom")?.value || "",
    to: document.getElementById("dashTo")?.value || ""
  };
}

function dashboardDays() {
  const { from, to } = dashboardRange();
  return state.daily.filter((day) => dateInRange(day.date, from, to));
}

function dashboardExpenses() {
  const { from, to } = dashboardRange();
  return state.expenses.filter((item) => dateInRange(item.date, from, to));
}

function totalsForDay(day) {
  const hasNewDriverData = day.drivers6 || day.drivers7;
  const driverQty6 = Object.values(day.drivers6 || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  const driverQty7 = Object.values(day.drivers7 || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  const legacyDriverQty = hasNewDriverData ? 0 : Object.values(day.drivers || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  const driverQty = driverQty6 + driverQty7 + legacyDriverQty;

  const direct6 = Number(day.direct6 || 0);
  const direct7 = Number(day.direct7 || 0);
  const direct8 = Number(day.direct8 || 0);
  const direct10 = Number(day.direct10 || 0);
  const physicalBottlesSold = Number(day.physicalBottlesSold || 0);
  const physicalBottleUnitPrice = Number(day.physicalBottleUnitPrice || 0);
  const gasolineSoldLiters = Number(day.gasolineSoldLiters || 0);

  const sold = driverQty + direct6 + direct7 + direct8 + direct10;

  const driverIncome6 = driverQty6 * Number(state.config.priceDriver6 || 6);
  const driverIncome7 = driverQty7 * Number(state.config.priceDriver7 || 7);
  const legacyDriverIncome = legacyDriverQty * Number(state.config.priceDriver || 6);
  const driverIncome = driverIncome6 + driverIncome7 + legacyDriverIncome;
  const directIncome = direct6 * Number(state.config.priceDirect6 || 6) +
                       direct7 * state.config.priceDirect7 +
                       direct8 * state.config.priceDirect8 +
                       direct10 * Number(state.config.priceDirect10 || 10);
  const physicalBottleIncome = physicalBottlesSold * physicalBottleUnitPrice;
  const gasolineSaleIncome = gasolineSoldLiters * Number(state.config.gasolineSalePrice || 7);
  const income = driverIncome + directIncome + physicalBottleIncome + gasolineSaleIncome;

  const supplyCost =
    Number(day.capsUsed || 0) * state.config.costCap +
    Number(day.labelsUsed || 0) * state.config.costLabel +
    Number(day.sealsUsed || 0) * state.config.costSeal;
  const productionEmployee1CommissionCost = sold * Number(state.config.productionEmployee1Commission || 0);
  const productionEmployee2CommissionCost = sold * Number(state.config.productionEmployee2Commission || 0);
  const productionCommissionCost = productionEmployee1CommissionCost + productionEmployee2CommissionCost;
  const fuelCost = gasCostForDay(day) + dieselCostForDay(day);
  const variableCost = supplyCost + productionCommissionCost + fuelCost;
  const lossCharge = (Number(day.broken || 0) + Number(day.lost || 0)) * state.config.lostCharge;
  const leftover = Number(day.produced || 0) - sold;

  const cashByDriverTotal = Object.values(day.cashByDriver || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  const qrByDriverTotal = Object.values(day.qrByDriver || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  const totalCash = Number(day.cash || 0) + cashByDriverTotal;
  const totalQr = Number(day.qr || 0) + qrByDriverTotal;

  return { driverQty, direct6, direct7, direct8, direct10, physicalBottlesSold, physicalBottleUnitPrice, gasolineSoldLiters, gasolineSaleIncome, sold, income, physicalBottleIncome, supplyCost, productionEmployee1CommissionCost, productionEmployee2CommissionCost, productionCommissionCost, fuelCost, variableCost, lossCharge, leftover, totalCash, totalQr };
}

function gasForDay(day) {
  const byDriver = Object.values(day.gasByDriver || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  return byDriver || Number(day.gasLiters || 0);
}

function dieselForDay(day) {
  const byDriver = Object.values(day.dieselByDriver || {}).reduce((sum, val) => sum + Number(val || 0), 0);
  return byDriver || Number(day.dieselLiters || 0);
}

function gasCostForDay(day) {
  return Number(day.gasCost || 0) || gasForDay(day) * Number(state.config.gasolineLiterCost || 0);
}

function dieselCostForDay(day) {
  return Number(day.dieselCost || 0) || dieselForDay(day) * Number(state.config.dieselLiterCost || 0);
}

function monthKey(date) {
  return date ? date.slice(0, 7) : "";
}

function automaticDepreciationFor(days, expenses) {
  const months = new Set();
  days.forEach((day) => months.add(monthKey(day.date)));
  expenses.forEach((item) => months.add(monthKey(item.date)));
  months.delete("");
  return months.size * Number(state.config.monthlyDepreciation || 0);
}

function aggregateActivity(days, expenses) {
  const dailyTotals = days.map((day) => ({ day, ...totalsForDay(day) }));
  const used = days.reduce((acc, day) => {
    acc.capsDelivered += Number(day.capsDelivered || 0);
    acc.labelsDelivered += Number(day.labelsDelivered || 0);
    acc.sealsDelivered += Number(day.sealsDelivered || 0);
    acc.caps += Number(day.capsUsed || 0);
    acc.labels += Number(day.labelsUsed || 0);
    acc.seals += Number(day.sealsUsed || 0);
    acc.broken += Number(day.broken || 0);
    acc.lost += Number(day.lost || 0);
    acc.physicalBottlesSold += Number(day.physicalBottlesSold || 0);
    acc.produced += Number(day.produced || 0);
    acc.gasLiters += gasForDay(day);
    acc.dieselLiters += dieselForDay(day);
    acc.gasolineSold += Number(day.gasolineSoldLiters || 0);
    return acc;
  }, { capsDelivered: 0, labelsDelivered: 0, sealsDelivered: 0, caps: 0, labels: 0, seals: 0, broken: 0, lost: 0, physicalBottlesSold: 0, produced: 0, gasLiters: 0, dieselLiters: 0, gasolineSold: 0 });

  const sold = dailyTotals.reduce((sum, row) => sum + row.sold, 0);
  const income = dailyTotals.reduce((sum, row) => sum + row.income, 0);
  const supplyCost = dailyTotals.reduce((sum, row) => sum + row.supplyCost, 0);
  const productionEmployee1CommissionCost = dailyTotals.reduce((sum, row) => sum + row.productionEmployee1CommissionCost, 0);
  const productionEmployee2CommissionCost = dailyTotals.reduce((sum, row) => sum + row.productionEmployee2CommissionCost, 0);
  const productionCommissionCost = dailyTotals.reduce((sum, row) => sum + row.productionCommissionCost, 0);
  const fuelCost = dailyTotals.reduce((sum, row) => sum + row.fuelCost, 0);
  const variableCost = dailyTotals.reduce((sum, row) => sum + row.variableCost, 0);
  const lossCharge = dailyTotals.reduce((sum, row) => sum + row.lossCharge, 0);
  const totalCash = dailyTotals.reduce((sum, row) => sum + row.totalCash, 0);
  const totalQr = dailyTotals.reduce((sum, row) => sum + row.totalQr, 0);
  const automaticDepreciation = automaticDepreciationFor(days, expenses);
  const fixedExpenses = expenses.filter((item) => item.type === "Mensual").reduce((sum, item) => sum + Number(item.amount || 0), 0) + automaticDepreciation;
  const dailyExpenses = expenses.filter((item) => item.type !== "Mensual").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = fixedExpenses + dailyExpenses;
  const totalVariableCost = variableCost + dailyExpenses;
  const totalCost = totalVariableCost + fixedExpenses;
  return {
    dailyTotals,
    used,
    sold,
    income,
    supplyCost,
    productionEmployee1CommissionCost,
    productionEmployee2CommissionCost,
    productionCommissionCost,
    fuelCost,
    variableCost,
    lossCharge,
    totalCash,
    totalQr,
    expenses: expenseTotal,
    automaticDepreciation,
    fixedExpenses,
    dailyExpenses,
    totalVariableCost,
    totalCost,
    net: income + lossCharge - variableCost - expenseTotal
  };
}

function costPerBottleMetrics(data) {
  const soldBase = data.sold || 0;
  const producedBase = data.used.produced || 0;
  return {
    variablePerSold: soldBase ? data.totalVariableCost / soldBase : 0,
    fixedPerSold: soldBase ? data.fixedExpenses / soldBase : 0,
    totalPerSold: soldBase ? data.totalCost / soldBase : 0,
    totalPerProduced: producedBase ? data.totalCost / producedBase : 0
  };
}

function driverQtyForDay(day, driver) {
  const hasNew = day.drivers6 || day.drivers7;
  if (hasNew) {
    return Number((day.drivers6 || {})[driver] || 0) + Number((day.drivers7 || {})[driver] || 0);
  }
  return Number((day.drivers || {})[driver] || 0);
}

function calculateDriverDebts() {
  const debts = {};
  state.config.drivers.forEach((driver) => {
    debts[driver] = { broken: 0, lost: 0, charged: 0, paid: 0, balance: 0 };
  });

  state.daily.forEach((day) => {
    const broken = Number(day.broken || 0);
    const lost = Number(day.lost || 0);
    if (broken > 0 && day.brokenDriver) {
      if (!debts[day.brokenDriver]) debts[day.brokenDriver] = { broken: 0, lost: 0, charged: 0, paid: 0, balance: 0 };
      debts[day.brokenDriver].broken += broken;
      debts[day.brokenDriver].charged += broken * state.config.lostCharge;
    }
    if (lost > 0 && day.lostDriver) {
      if (!debts[day.lostDriver]) debts[day.lostDriver] = { broken: 0, lost: 0, charged: 0, paid: 0, balance: 0 };
      debts[day.lostDriver].lost += lost;
      debts[day.lostDriver].charged += lost * state.config.lostCharge;
    }
  });

  (state.debtPayments || []).forEach((payment) => {
    if (!debts[payment.driver]) debts[payment.driver] = { broken: 0, lost: 0, charged: 0, paid: 0, balance: 0 };
    debts[payment.driver].paid += Number(payment.amount || 0);
  });

  Object.values(debts).forEach((row) => {
    row.balance = row.charged - row.paid;
  });

  return debts;
}

function liabilityDebtSummary() {
  return (state.liabilityDebts || []).map((debt) => {
    const paid = (state.liabilityPayments || [])
      .filter((payment) => payment.debtId === debt.id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const amount = Number(debt.amount || 0);
    return { ...debt, amount, paid, balance: amount - paid };
  });
}

function calculateAll() {
  const activity = aggregateActivity(state.daily, state.expenses);
  const dailyTotals = activity.dailyTotals;
  const purchases = state.purchases.reduce((acc, item) => {
    acc[item.item] = (acc[item.item] || 0) + Number(item.qty || 0);
    acc.cost += Number(item.cost || 0);
    return acc;
  }, { caps: 0, labels: 0, seals: 0, bottles: 0, gasoline: 0, diesel: 0, cost: 0 });

  const used = activity.used;

  const stock = {
    bottles: state.config.initialBottles + purchases.bottles - used.broken - used.lost - used.physicalBottlesSold,
    caps: state.config.initialCaps + purchases.caps - used.caps,
    labels: state.config.initialLabels + purchases.labels - used.labels,
    seals: state.config.initialSeals + purchases.seals - used.seals,
    gasoline: Number(state.config.initialGasoline || 0) + purchases.gasoline - used.gasLiters - used.gasolineSold,
    diesel: Number(state.config.initialDiesel || 0) + purchases.diesel - used.dieselLiters,
    ready: dailyTotals.reduce((sum, row) => sum + row.leftover, 0)
  };

  return {
    dailyTotals,
    purchases,
    used,
    sold: activity.sold,
    income: activity.income,
    variableCost: activity.variableCost,
    lossCharge: activity.lossCharge,
    expenses: activity.expenses,
    net: activity.net,
    stock,
    driverDebts: calculateDriverDebts()
  };
}

function setDefaultDates() {
  ["date", "purchaseDate", "dailyExpenseDate", "monthlyExpenseDate", "debtPaymentDate", "dailySpendDate", "debtDate", "debtInstallmentDate"].forEach((id) => {
    const input = document.getElementById(id);
    if (input && !input.value) input.value = todayIso();
  });
}

function renderKpis() {
  const all = calculateAll();
  const data = aggregateActivity(dashboardDays(), dashboardExpenses());
  const driverDebtBalance = Object.values(all.driverDebts).reduce((sum, row) => sum + row.balance, 0);
  const { from, to } = dashboardRange();
  const period = from || to ? `Filtro: ${from || "inicio"} a ${to || "hoy"}` : "Todos los registros";
  const kpis = [
    ["Ingresos", money(data.income), period],
    ["Ganancia neta", money(data.net), "Del período filtrado"],
    ["Efectivo total", money(data.totalCash), "Período filtrado"],
    ["QR total", money(data.totalQr), "Período filtrado"],
    ["Bidones vendidos", number(data.sold), "Del período filtrado"],
    ["Bidones producidos", number(data.used.produced), "Del período filtrado"],
    ["Bidones físicos vendidos", number(data.used.physicalBottlesSold), `${money(data.dailyTotals.reduce((sum, row) => sum + row.physicalBottleIncome, 0))} en envases`],
    ["Gasolina entregada", `${number(data.used.gasLiters)} L`, "Del período filtrado"],
    ["Diésel entregado", `${number(data.used.dieselLiters)} L`, "Del período filtrado"],
    ["Tapas disponibles", number(all.stock.caps), stockStatus(all.stock.caps)],
    ["Etiquetas disponibles", number(all.stock.labels), stockStatus(all.stock.labels)],
    ["Sellos disponibles", number(all.stock.seals), stockStatus(all.stock.seals)],
    ["Rotos/perdidos", number(data.used.broken + data.used.lost), `${money(data.lossCharge)} generado`],
    ["Deuda choferes", money(driverDebtBalance), "Saldo pendiente"]
  ];
  document.getElementById("kpis").innerHTML = kpis.map(kpiHtml).join("");
}

function kpiHtml([label, value, note]) {
  return `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function stockStatus(value) {
  return value <= state.config.lowStock ? "Stock bajo" : "Stock correcto";
}

function renderStock() {
  const { stock } = calculateAll();
  const rows = [
    ["Bidones físicos activos", stock.bottles],
    ["Bidones llenos sobrantes", stock.ready],
    ["Tapas", stock.caps],
    ["Etiquetas", stock.labels],
    ["Sellos", stock.seals],
    ["Gasolina saldo", `${number(stock.gasoline)} L`],
    ["Diésel saldo", `${number(stock.diesel)} L`]
  ];
  const html = rows.map(([label, value]) => {
    const numericValue = typeof value === "number" ? value : Number.parseFloat(value) || 0;
    const isFuel = label.includes("Gasolina") || label.includes("Diésel");
    const cls = numericValue <= state.config.lowStock && !label.includes("Bidones") && !isFuel ? "low" : "ok";
    return `<div class="stock-row"><span>${label}</span><strong class="${cls}">${typeof value === "number" ? number(value) : value}</strong></div>`;
  }).join("");
  document.getElementById("stockList").innerHTML = html;
  document.getElementById("inventoryDetail").innerHTML = html;
}

function renderDriverInputs() {
  const wrap = document.getElementById("driverInputs");
  wrap.innerHTML = state.config.drivers.map((driver) => `
    <details class="driver-panel">
      <summary class="driver-panel-summary">${driver} <span class="driver-panel-hint">— clic para expandir</span></summary>
      <div class="driver-panel-body">
        <label>Vendidos a 6 Bs <input class="driverSale6" data-driver="${driver}" type="number" min="0" value="0"></label>
        <label>Vendidos a 7 Bs <input class="driverSale7" data-driver="${driver}" type="number" min="0" value="0"></label>
        <label>Gasolina (litros) <input class="driverGas" data-driver="${driver}" type="number" min="0" step="0.01" value="0"></label>
        <label>Diésel (litros) <input class="driverDiesel" data-driver="${driver}" type="number" min="0" step="0.01" value="0"></label>
        <label>Efectivo recibido <input class="driverCash" data-driver="${driver}" type="number" min="0" step="0.01" value="0"></label>
        <label>QR recibido <input class="driverQr" data-driver="${driver}" type="number" min="0" step="0.01" value="0"></label>
      </div>
    </details>
  `).join("");
}

function driverOptions(selected = "") {
  return `<option value="">Elegir chofer</option>` + state.config.drivers.map((driver) => {
    const isSelected = driver === selected ? " selected" : "";
    return `<option${isSelected}>${driver}</option>`;
  }).join("");
}

function renderDriverSelects() {
  ["brokenDriver", "lostDriver", "debtPaymentDriver"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = select.value;
    select.innerHTML = driverOptions(selected);
  });
}

function renderDriverSummary() {
  const days = dashboardDays();
  const rows = state.config.drivers.map((driver) => {
    const qty = days.reduce((sum, day) => sum + driverQtyForDay(day, driver), 0);
    const gas = days.reduce((sum, day) => sum + Number((day.gasByDriver || {})[driver] || 0), 0);
    const diesel = days.reduce((sum, day) => sum + Number((day.dieselByDriver || {})[driver] || 0), 0);
    const cash = days.reduce((sum, day) => sum + Number((day.cashByDriver || {})[driver] || 0), 0);
    const qr = days.reduce((sum, day) => sum + Number((day.qrByDriver || {})[driver] || 0), 0);
    return `<div class="mini-row"><span>${driver}<br><small>Ef: ${money(cash)} | QR: ${money(qr)} | G:${number(gas)}L | D:${number(diesel)}L</small></span><strong>${number(qty)} bidones</strong></div>`;
  }).join("");
  document.getElementById("driverSummary").innerHTML = rows || "<p>No hay choferes cargados.</p>";
}

function renderDriverDebts() {
  const debts = calculateDriverDebts();
  const rows = Object.entries(debts).map(([driver, row]) => {
    const cls = row.balance > 0 ? "low" : "ok";
    return `<div class="stock-row">
      <span>${driver}<br><small>${number(row.broken)} rotos, ${number(row.lost)} perdidos, pagó ${money(row.paid)}</small></span>
      <strong class="${cls}">${money(row.balance)}</strong>
    </div>`;
  }).join("");
  const empty = "<p>No hay deudas cargadas.</p>";
  document.getElementById("driverDebtSummary").innerHTML = rows || empty;
  document.getElementById("driverDebtDetail").innerHTML = rows || empty;
}

function renderProductionSupplySummary() {
  const data = aggregateActivity(dashboardDays(), dashboardExpenses());
  const rows = [
    ["Tapas entregadas", data.used.capsDelivered],
    ["Etiquetas entregadas", data.used.labelsDelivered],
    ["Sellos entregados", data.used.sealsDelivered],
    ["Tapas usadas", data.used.caps],
    ["Etiquetas usadas", data.used.labels],
    ["Sellos usados", data.used.seals]
  ].map(([label, value]) => `
    <div class="stock-row"><span>${label}</span><strong>${number(value)}</strong></div>
  `).join("");
  document.getElementById("productionSupplySummary").innerHTML = rows;
}

function renderCostPerBottleSummary() {
  const data = aggregateActivity(dashboardDays(), dashboardExpenses());
  const metrics = costPerBottleMetrics(data);
  const rows = [
    ["Insumos usados", money(data.supplyCost), "Tapas, etiquetas y sellos"],
    ["Comisión empleado 1", money(data.productionEmployee1CommissionCost), `${money(state.config.productionEmployee1Commission)} por bidón vendido`],
    ["Comisión empleado 2", money(data.productionEmployee2CommissionCost), `${money(state.config.productionEmployee2Commission)} por bidón vendido`],
    ["Comisión producción total", money(data.productionCommissionCost), `${money(state.config.commission)} por bidón vendido entre ambos`],
    ["Combustible", money(data.fuelCost), "Gasolina y diésel del período"],
    ["Gastos diarios", money(data.dailyExpenses), "Variables cargados en gastos diarios"],
    ["Costos variables", money(data.totalVariableCost), "Insumos + comisión + combustible + gastos diarios"],
    ["Depreciación automática", money(data.automaticDepreciation), `${money(state.config.monthlyDepreciation)} por mes con movimiento`],
    ["Costos fijos", money(data.fixedExpenses), "Gastos mensuales del período"],
    ["Costo total", money(data.totalCost), "Variable + fijo"],
    ["Costo por bidón vendido", money(metrics.totalPerSold), `${number(data.sold)} bidones vendidos`],
    ["Costo por bidón producido", money(metrics.totalPerProduced), `${number(data.used.produced)} bidones producidos`],
    ["Solo variable por vendido", money(metrics.variablePerSold), "Sin gastos fijos"]
  ].map(([label, value, note]) => `
    <div class="stock-row"><span>${label}<br><small>${note}</small></span><strong>${value}</strong></div>
  `).join("");
  document.getElementById("costPerBottleSummary").innerHTML = rows;
}

function deliveredSummary(day) {
  return `T:${number(day.capsDelivered || 0)} E:${number(day.labelsDelivered || 0)} S:${number(day.sealsDelivered || 0)}`;
}

function renderDailyRows() {
  const rows = [...state.daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  document.getElementById("dailyRows").innerHTML = rows.map((day) => {
    const t = totalsForDay(day);
    const sunday = isSunday(day.date) ? " <span class='warn'>(No se trabaja)</span>" : "";
    return `<tr>
      <td>${day.date}</td>
      <td>${dayName(day.date)}${sunday}</td>
      <td>${number(day.produced)}</td>
      <td>${number(t.sold)}</td>
      <td>${number(t.physicalBottlesSold)}</td>
      <td>${deliveredSummary(day)}</td>
      <td>${money(t.income)}</td>
      <td>${money(t.totalCash)}</td>
      <td>${money(t.totalQr)}</td>
      <td>${number(t.leftover)}</td>
      <td><button class="ghost" data-edit-day="${day.id}">Editar</button><button class="danger" data-delete-day="${day.id}">Borrar</button></td>
    </tr>`;
  }).join("");
}

function renderDebtPayments() {
  document.getElementById("debtPaymentRows").innerHTML = [...(state.debtPayments || [])].sort((a, b) => b.date.localeCompare(a.date)).map((item) => `
    <tr><td>${item.date}</td><td>${item.driver}</td><td>${money(item.amount)}</td><td>${item.note || ""}</td><td><button class="danger" data-delete-debt-payment="${item.id}">Borrar</button></td></tr>
  `).join("");
}

function renderLiabilities() {
  const summaries = liabilityDebtSummary().sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("liabilityDebtRows").innerHTML = summaries.map((debt) => `
    <tr>
      <td>${debt.date}</td><td>${debt.name}</td><td>${money(debt.amount)}</td><td>${money(debt.paid)}</td>
      <td>${money(debt.balance)}</td><td><button class="danger" data-delete-liability-debt="${debt.id}">Borrar</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6">No hay deudas cargadas.</td></tr>`;

  document.getElementById("liabilityPaymentRows").innerHTML = [...(state.liabilityPayments || [])].sort((a, b) => b.date.localeCompare(a.date)).map((payment) => {
    const debt = (state.liabilityDebts || []).find((item) => item.id === payment.debtId);
    return `<tr><td>${payment.date}</td><td>${debt?.name || "Deuda borrada"}</td><td>${money(payment.amount)}</td><td>${payment.note || ""}</td><td><button class="danger" data-delete-liability-payment="${payment.id}">Borrar</button></td></tr>`;
  }).join("") || `<tr><td colspan="5">No hay pagos cargados.</td></tr>`;

  const active = summaries.filter((debt) => debt.balance > 0);
  document.getElementById("debtInstallmentDebt").innerHTML = active.map((debt) => `
    <option value="${debt.id}">${debt.name} - saldo ${money(debt.balance)}</option>
  `).join("") || `<option value="">No hay deudas pendientes</option>`;
}

function purchaseName(item) {
  const names = { caps: "Tapas", labels: "Etiquetas", seals: "Sellos", bottles: "Bidones nuevos", gasoline: "Gasolina", diesel: "Diésel" };
  return names[item] || item;
}

function renderPurchases() {
  const names = { caps: "Tapas", labels: "Etiquetas", seals: "Sellos", bottles: "Bidones nuevos", gasoline: "Gasolina", diesel: "Diésel" };
  document.getElementById("purchaseRows").innerHTML = [...state.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((item) => `
    <tr><td>${item.date}</td><td>${purchaseName(item.item)}</td><td>${number(item.qty)}</td><td>${money(item.cost)}</td><td><button class="danger" data-delete-purchase="${item.id}">Borrar</button></td></tr>
  `).join("");
}

function renderExpenses() {
  const sorted = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const rowHtml = (item) => `
    <tr><td>${item.date}</td><td>${item.category}</td><td>${money(item.amount)}</td><td>${item.note || ""}</td><td><button class="danger" data-delete-expense="${item.id}">Borrar</button></td></tr>
  `;
  const purchaseRowHtml = (p) => `
    <tr><td>${p.date}</td><td>Compra: ${purchaseName(p.item)}</td><td>${money(p.cost)}</td><td>${number(p.qty)} ${p.item === "gasoline" || p.item === "diesel" ? "litros" : "unidades"}</td><td><button class="danger" data-delete-purchase="${p.id}">Borrar</button></td></tr>
  `;
  const dailyExpenses = sorted.filter((item) => item.type === "Diario" || item.type === "Extraordinario").map((item) => ({ date: item.date, html: rowHtml(item) }));
  const purchasesAsRows = [...state.purchases].map((p) => ({ date: p.date, html: purchaseRowHtml(p) }));
  const allDaily = [...dailyExpenses, ...purchasesAsRows].sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("dailyExpenseRows").innerHTML = allDaily.map((r) => r.html).join("");
  const months = new Set([monthKey(todayIso())]);
  state.daily.forEach((day) => months.add(monthKey(day.date)));
  state.expenses.forEach((item) => months.add(monthKey(item.date)));
  state.purchases.forEach((item) => months.add(monthKey(item.date)));
  months.delete("");
  const depreciationRows = [...months].sort().reverse().map((month) => `
    <tr><td>${month}</td><td>Depreciación automática</td><td>${money(state.config.monthlyDepreciation)}</td><td>Gasto fijo automático mensual</td><td>Automático</td></tr>
  `);
  document.getElementById("monthlyExpenseRows").innerHTML = [
    ...depreciationRows,
    ...sorted.filter((item) => item.type === "Mensual").map(rowHtml)
  ].join("");
}

function renderDailySpendSummary() {
  const date = document.getElementById("dailySpendDate").value || todayIso();
  const dailyExpenses = state.expenses.filter((item) => item.date === date && item.type !== "Mensual");
  const purchases = state.purchases.filter((item) => item.date === date);
  const liabilityPayments = (state.liabilityPayments || []).filter((item) => item.date === date);
  const dayRecords = state.daily.filter((item) => item.date === date);
  const expenseTotal = dailyExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const purchaseTotal = purchases.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const liabilityPaymentTotal = liabilityPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const variableRows = [];
  const addVariableRow = (category, qty, unitCost, note) => {
    const amount = Number(qty || 0) * Number(unitCost || 0);
    if (amount > 0) variableRows.push({ category, note, amount });
  };

  const totals = dayRecords.reduce((acc, day) => {
    const t = totalsForDay(day);
    acc.caps += Number(day.capsUsed || 0);
    acc.labels += Number(day.labelsUsed || 0);
    acc.seals += Number(day.sealsUsed || 0);
    acc.sold += t.sold;
    acc.employee1 += t.productionEmployee1CommissionCost;
    acc.employee2 += t.productionEmployee2CommissionCost;
    acc.gas += gasCostForDay(day);
    acc.diesel += dieselCostForDay(day);
    return acc;
  }, { caps: 0, labels: 0, seals: 0, sold: 0, employee1: 0, employee2: 0, gas: 0, diesel: 0 });

  addVariableRow("Tapas usadas", totals.caps, state.config.costCap, `${number(totals.caps)} unidades`);
  addVariableRow("Etiquetas usadas", totals.labels, state.config.costLabel, `${number(totals.labels)} unidades`);
  addVariableRow("Sellos usados", totals.seals, state.config.costSeal, `${number(totals.seals)} unidades`);
  if (totals.employee1 > 0) variableRows.push({ category: "Comisión empleado 1", note: `${number(totals.sold)} bidones vendidos`, amount: totals.employee1 });
  if (totals.employee2 > 0) variableRows.push({ category: "Comisión empleado 2", note: `${number(totals.sold)} bidones vendidos`, amount: totals.employee2 });
  if (totals.gas > 0) variableRows.push({ category: "Gasolina usada", note: `${money(state.config.gasolineLiterCost)} por litro si no hay costo manual`, amount: totals.gas });
  if (totals.diesel > 0) variableRows.push({ category: "Diésel usado", note: `${money(state.config.dieselLiterCost)} por litro si no hay costo manual`, amount: totals.diesel });

  const variableTotal = variableRows.reduce((sum, item) => sum + item.amount, 0);
  const total = expenseTotal + purchaseTotal + variableTotal + liabilityPaymentTotal;
  const cashTotal = dayRecords.reduce((sum, day) => sum + totalsForDay(day).totalCash, 0);
  const qrTotal = dayRecords.reduce((sum, day) => sum + totalsForDay(day).totalQr, 0);

  document.getElementById("dailySpendKpis").innerHTML = [
    ["Efectivo recibido", money(cashTotal), "Choferes + venta directa"],
    ["QR recibido", money(qrTotal), "Choferes + venta directa"],
    ["Gastos diarios", money(expenseTotal), "Cargados en gastos"],
    ["Compras", money(purchaseTotal), "Tapas, etiquetas, sellos, combustible, etc."],
    ["Variables producción", money(variableTotal), "Tapas, etiquetas, sellos, comisión y combustible usado"],
    ["Pagos de deuda", money(liabilityPaymentTotal), "Cuotas o pagos de préstamos"],
    ["Total del día", money(total), date]
  ].map(kpiHtml).join("");

  const expenseRows = dailyExpenses.map((item) => `
    <tr><td>Gasto diario</td><td>${item.category}</td><td>${item.note || ""}</td><td>${money(item.amount)}</td></tr>
  `);
  const purchaseRows = purchases.map((item) => {
    const unit = item.item === "gasoline" || item.item === "diesel" ? "L" : "unid.";
    return `<tr><td>Compra</td><td>${purchaseName(item.item)}</td><td>${number(item.qty)} ${unit}</td><td>${money(item.cost)}</td></tr>`;
  });
  const productionRows = variableRows.map((item) => `
    <tr><td>Variable producción</td><td>${item.category}</td><td>${item.note}</td><td>${money(item.amount)}</td></tr>
  `);
  const liabilityRows = liabilityPayments.map((payment) => {
    const debt = (state.liabilityDebts || []).find((item) => item.id === payment.debtId);
    return `<tr><td>Pago deuda</td><td>${debt?.name || "Deuda borrada"}</td><td>${payment.note || ""}</td><td>${money(payment.amount)}</td></tr>`;
  });

  document.getElementById("dailySpendRows").innerHTML = [...expenseRows, ...purchaseRows, ...productionRows, ...liabilityRows].join("") || `
    <tr><td colspan="4">No hay gastos ni compras cargadas para esta fecha.</td></tr>
  `;
}

function allExpenseLikeRows() {
  const expenseRows = (state.expenses || []).map((item) => ({
    date: item.date,
    type: item.type,
    category: item.category,
    note: item.note || "",
    amount: Number(item.amount || 0)
  }));
  const purchaseRows = (state.purchases || []).map((p) => ({
    date: p.date,
    type: "Compra",
    category: `Compra: ${purchaseName(p.item)}`,
    note: `${number(p.qty)} ${p.item === "gasoline" || p.item === "diesel" ? "litros" : "unidades"}`,
    amount: Number(p.cost || 0)
  }));
  const liabilityRows = (state.liabilityPayments || []).map((payment) => {
    const debt = (state.liabilityDebts || []).find((item) => item.id === payment.debtId);
    return {
      date: payment.date,
      type: "Pago deuda",
      category: debt?.name || "Deuda borrada",
      note: payment.note || "",
      amount: Number(payment.amount || 0)
    };
  });
  return [...expenseRows, ...purchaseRows, ...liabilityRows].sort((a, b) => b.date.localeCompare(a.date));
}

function renderExpenseFilter() {
  const rows = allExpenseLikeRows();
  const categorySelect = document.getElementById("expenseFilterCategory");
  const selectedCategory = categorySelect.value;
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort();
  categorySelect.innerHTML = `<option value="">Todas</option>` + categories.map((category) => `<option>${category}</option>`).join("");
  categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : "";

  const type = document.getElementById("expenseFilterType").value;
  const category = categorySelect.value;
  const from = document.getElementById("expenseFilterFrom").value;
  const to = document.getElementById("expenseFilterTo").value;
  const filtered = rows.filter((row) => {
    if (type && row.type !== type) return false;
    if (category && row.category !== category) return false;
    if (!dateInRange(row.date, from, to)) return false;
    return true;
  });
  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  document.getElementById("expenseFilterKpis").innerHTML = [
    ["Total filtrado", money(total), "Según filtros"],
    ["Cantidad registros", number(filtered.length), "Movimientos"],
    ["Tipos", number(new Set(filtered.map((row) => row.type)).size), "Tipos distintos"]
  ].map(kpiHtml).join("");
  document.getElementById("expenseFilterRows").innerHTML = filtered.map((row) => `
    <tr><td>${row.date}</td><td>${row.type}</td><td>${row.category}</td><td>${row.note}</td><td>${money(row.amount)}</td></tr>
  `).join("") || `<tr><td colspan="5">No hay gastos para esos filtros.</td></tr>`;
}

function renderReports() {
  const driverSelect = document.getElementById("filterDriver");
  const current = driverSelect.value;
  driverSelect.innerHTML = `<option value="">Todos</option>` + state.config.drivers.map((d) => `<option>${d}</option>`).join("");
  driverSelect.value = current;

  const from = document.getElementById("filterFrom").value;
  const to = document.getElementById("filterTo").value;
  const driver = driverSelect.value;
  const rows = [];

  state.daily.forEach((day) => {
    if (from && day.date < from) return;
    if (to && day.date > to) return;
    const total = totalsForDay(day);
    if (driver) {
      const qty = driverQtyForDay(day, driver);
      const qty6 = Number((day.drivers6 || {})[driver] || 0);
      const qty7 = Number((day.drivers7 || {})[driver] || 0);
      const legacyQty = (day.drivers6 || day.drivers7) ? 0 : Number((day.drivers || {})[driver] || 0);
      const driverInc = qty6 * Number(state.config.priceDriver6 || 6) + qty7 * Number(state.config.priceDriver7 || 7) + legacyQty * Number(state.config.priceDriver || 6);
      if (qty > 0) rows.push({ date: day.date, driver, qty, income: driverInc, total });
    } else {
      state.config.drivers.forEach((name) => {
        const qty = driverQtyForDay(day, name);
        const qty6 = Number((day.drivers6 || {})[name] || 0);
        const qty7 = Number((day.drivers7 || {})[name] || 0);
        const legacyQty = (day.drivers6 || day.drivers7) ? 0 : Number((day.drivers || {})[name] || 0);
        const driverInc = qty6 * Number(state.config.priceDriver6 || 6) + qty7 * Number(state.config.priceDriver7 || 7) + legacyQty * Number(state.config.priceDriver || 6);
        if (qty > 0) rows.push({ date: day.date, driver: name, qty, income: driverInc, total });
      });
      const directQty = Number(day.direct6 || 0) + Number(day.direct7 || 0) + Number(day.direct8 || 0) + Number(day.direct10 || 0);
      const directInc = Number(day.direct6 || 0) * Number(state.config.priceDirect6 || 6) +
                        Number(day.direct7 || 0) * state.config.priceDirect7 +
                        Number(day.direct8 || 0) * state.config.priceDirect8 +
                        Number(day.direct10 || 0) * Number(state.config.priceDirect10 || 10);
      if (directQty > 0) {
        rows.push({ date: day.date, driver: "Venta directa", qty: directQty, income: directInc, total });
      }
    }
  });

  const sold = rows.reduce((sum, row) => sum + row.qty, 0);
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const all = calculateAll();
  document.getElementById("reportKpis").innerHTML = [
    ["Bidones", number(sold), "Resultado filtrado"],
    ["Ingresos", money(income), "Resultado filtrado"],
    ["Ganancia total", money(all.net), "Todos los datos"]
  ].map(kpiHtml).join("");

  document.getElementById("reportRows").innerHTML = rows.sort((a, b) => b.date.localeCompare(a.date)).map((row) => `
    <tr><td>${row.date}</td><td>${row.driver}</td><td>${number(row.qty)}</td><td>${money(row.income)}</td><td>${money(row.total.income)}</td><td>${money(row.total.income - row.total.variableCost)}</td></tr>
  `).join("");
}

function loadConfigForm() {
  Object.entries(state.config).forEach(([key, value]) => {
    const input = document.getElementById(key);
    if (!input) return;
    input.value = Array.isArray(value) ? value.join(", ") : value;
  });
}

function renderSalesChart() {
  const canvas = document.getElementById("salesChart");
  if (!canvas || typeof Chart === "undefined") return;
  const today = todayIso();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const labels = days.map(d => d.slice(5).replace("-", "/"));
  const data = days.map(d => {
    const day = state.daily.find(r => r.date === d);
    return day ? totalsForDay(day).sold : 0;
  });
  if (salesChartInstance) salesChartInstance.destroy();
  salesChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Bidones vendidos",
        data,
        backgroundColor: "#5bbfd4",
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

function renderMonthlyComparison() {
  const el = document.getElementById("monthlyComparison");
  if (!el) return;
  const thisMonth = todayIso().slice(0, 7);
  const prevDate = new Date(todayIso() + "T12:00:00");
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const thisDays = state.daily.filter(d => d.date.startsWith(thisMonth));
  const prevDays = state.daily.filter(d => d.date.startsWith(prevMonth));
  const thisExp = state.expenses.filter(e => e.date.startsWith(thisMonth));
  const prevExp = state.expenses.filter(e => e.date.startsWith(prevMonth));
  const t = aggregateActivity(thisDays, thisExp);
  const p = aggregateActivity(prevDays, prevExp);

  function pct(curr, prev) {
    if (prev === 0) return curr === 0 ? "sin datos" : "nuevo";
    const d = ((curr - prev) / prev * 100).toFixed(1);
    return (d >= 0 ? "+" : "") + d + "%";
  }
  function cls(curr, prev, invert) {
    if (curr === prev) return "";
    return (invert ? curr < prev : curr > prev) ? "ok" : "low";
  }

  const rows = [
    ["Bidones vendidos", number(t.sold), number(p.sold), pct(t.sold, p.sold), cls(t.sold, p.sold, false)],
    ["Ingresos", money(t.income), money(p.income), pct(t.income, p.income), cls(t.income, p.income, false)],
    ["Producidos", number(t.used.produced), number(p.used.produced), pct(t.used.produced, p.used.produced), cls(t.used.produced, p.used.produced, false)],
    ["Gastos", money(t.expenses), money(p.expenses), pct(t.expenses, p.expenses), cls(t.expenses, p.expenses, true)],
    ["Ganancia neta", money(t.net), money(p.net), pct(t.net, p.net), cls(t.net, p.net, false)]
  ];

  el.innerHTML = rows.map(([label, curr, prev, change, c]) => `
    <div class="stock-row">
      <span>${label}<br><small>Mes anterior: ${prev}</small></span>
      <strong class="${c}">${curr} <small>(${change})</small></strong>
    </div>
  `).join("");
}

function renderDriverRanking() {
  const el = document.getElementById("driverRanking");
  if (!el) return;
  const thisMonth = todayIso().slice(0, 7);
  const thisDays = state.daily.filter(d => d.date.startsWith(thisMonth));
  const ranking = state.config.drivers.map(driver => {
    const sold = thisDays.reduce((sum, day) => sum + driverQtyForDay(day, driver), 0);
    return { driver, sold };
  }).sort((a, b) => b.sold - a.sold);

  if (!ranking.length || ranking[0].sold === 0) {
    el.innerHTML = "<p>Sin ventas registradas este mes.</p>";
    return;
  }

  const pos = ["1er lugar", "2do lugar", "3er lugar"];
  el.innerHTML = ranking.map((row, i) => `
    <div class="stock-row ${i === 0 ? "top-driver" : ""}">
      <span>${pos[i] || `${i + 1}to`} &nbsp; <strong>${row.driver}</strong>${i === 0 ? " — Mejor chofer del mes" : ""}</span>
      <strong class="${i === 0 ? "ok" : ""}">${number(row.sold)} bidones</strong>
    </div>
  `).join("");
}

function renderDriverBonification() {
  const el = document.getElementById("driverBonification");
  if (!el) return;
  const days = dashboardDays();
  const rows = state.config.drivers.map((driver) => {
    let totalQty = 0;
    let bonus = 0;
    days.forEach((day) => {
      const qty = driverQtyForDay(day, driver);
      totalQty += qty;
      bonus += Math.floor(qty / 100) * 2;
    });
    return { driver, totalQty, bonus };
  }).filter((r) => r.totalQty > 0);

  if (!rows.length) {
    el.innerHTML = "<p>Sin ventas registradas en el período.</p>";
    return;
  }

  el.innerHTML = rows.map((row) => `
    <div class="stock-row">
      <span>${row.driver}<br><small>${number(row.totalQty)} bidones vendidos en el período</small></span>
      <strong class="${row.bonus > 0 ? "ok" : ""}">${number(row.bonus)} bidón${row.bonus !== 1 ? "es" : ""} gratis</strong>
    </div>
  `).join("");
}

function renderAll() {
  renderDriverInputs();
  renderDriverSelects();
  renderKpis();
  renderStock();
  renderDriverSummary();
  renderDriverDebts();
  renderProductionSupplySummary();
  renderCostPerBottleSummary();
  renderSalesChart();
  renderMonthlyComparison();
  renderDriverRanking();
  renderDriverBonification();
  renderDailyRows();
  renderPurchases();
  renderExpenses();
  renderDailySpendSummary();
  renderLiabilities();
  renderExpenseFilter();
  renderDebtPayments();
  renderReports();
  loadConfigForm();
  loadSupabaseForm();
  setDefaultDates();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .view").forEach((el) => el.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.view).classList.add("active");
    renderReports();
  });
});

document.getElementById("dailyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.getElementById("dailyId").value || uid();
  const broken = Number(document.getElementById("broken").value || 0);
  const lost = Number(document.getElementById("lost").value || 0);
  const brokenDriver = document.getElementById("brokenDriver").value;
  const lostDriver = document.getElementById("lostDriver").value;
  if (broken > 0 && !brokenDriver) {
    alert("Elegí qué chofer fue responsable del bidón roto.");
    return;
  }
  if (lost > 0 && !lostDriver) {
    alert("Elegí qué chofer fue responsable del bidón perdido.");
    return;
  }
  const drivers6 = {};
  document.querySelectorAll(".driverSale6").forEach((input) => {
    drivers6[input.dataset.driver] = Number(input.value || 0);
  });
  const drivers7 = {};
  document.querySelectorAll(".driverSale7").forEach((input) => {
    drivers7[input.dataset.driver] = Number(input.value || 0);
  });
  const cashByDriver = {};
  document.querySelectorAll(".driverCash").forEach((input) => {
    cashByDriver[input.dataset.driver] = Number(input.value || 0);
  });
  const qrByDriver = {};
  document.querySelectorAll(".driverQr").forEach((input) => {
    qrByDriver[input.dataset.driver] = Number(input.value || 0);
  });
  const drivers = {};
  state.config.drivers.forEach((d) => {
    drivers[d] = Number(drivers6[d] || 0) + Number(drivers7[d] || 0);
  });
  const gasByDriver = {};
  document.querySelectorAll(".driverGas").forEach((input) => {
    gasByDriver[input.dataset.driver] = Number(input.value || 0);
  });
  const driverGasTotal = Object.values(gasByDriver).reduce((sum, val) => sum + Number(val || 0), 0);
  const dieselByDriver = {};
  document.querySelectorAll(".driverDiesel").forEach((input) => {
    dieselByDriver[input.dataset.driver] = Number(input.value || 0);
  });
  const driverDieselTotal = Object.values(dieselByDriver).reduce((sum, val) => sum + Number(val || 0), 0);
  const record = {
    id,
    date: document.getElementById("date").value,
    produced: Number(document.getElementById("produced").value || 0),
    capsDelivered: Number(document.getElementById("capsDelivered").value || 0),
    labelsDelivered: Number(document.getElementById("labelsDelivered").value || 0),
    sealsDelivered: Number(document.getElementById("sealsDelivered").value || 0),
    capsUsed: Number(document.getElementById("capsUsed").value || 0),
    labelsUsed: Number(document.getElementById("labelsUsed").value || 0),
    sealsUsed: Number(document.getElementById("sealsUsed").value || 0),
    direct6: Number(document.getElementById("direct6").value || 0),
    direct7: Number(document.getElementById("direct7").value || 0),
    direct8: Number(document.getElementById("direct8").value || 0),
    direct10: Number(document.getElementById("direct10").value || 0),
    physicalBottlesSold: Number(document.getElementById("physicalBottlesSold").value || 0),
    physicalBottleUnitPrice: Number(document.getElementById("physicalBottleUnitPrice").value || 0),
    gasolineSoldLiters: Number(document.getElementById("gasolineSoldLiters").value || 0),
    cash: Number(document.getElementById("cash").value || 0),
    qr: Number(document.getElementById("qr").value || 0),
    broken,
    brokenDriver,
    lost,
    lostDriver,
    gasLiters: driverGasTotal || Number(document.getElementById("gasLiters").value || 0),
    gasByDriver,
    gasCost: Number(document.getElementById("gasCost").value || 0),
    dieselLiters: driverDieselTotal || Number(document.getElementById("dieselLiters").value || 0),
    dieselByDriver,
    dieselCost: Number(document.getElementById("dieselCost").value || 0),
    notes: document.getElementById("notes").value.trim(),
    drivers,
    drivers6,
    drivers7,
    cashByDriver,
    qrByDriver
  };
  state.daily = state.daily.filter((item) => item.id !== id);
  state.daily.push(record);
  saveState();
  event.target.reset();
  document.getElementById("dailyId").value = "";
  renderAll();
});

document.getElementById("clearDaily").addEventListener("click", () => {
  document.getElementById("dailyForm").reset();
  document.getElementById("dailyId").value = "";
  renderDriverInputs();
  renderDriverSelects();
  setDefaultDates();
});

document.getElementById("debtPaymentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const driver = document.getElementById("debtPaymentDriver").value;
  const amount = Number(document.getElementById("debtPaymentAmount").value || 0);
  if (!driver) {
    alert("Elegí el chofer que pagó la deuda.");
    return;
  }
  if (amount <= 0) {
    alert("Poné el monto que pagó.");
    return;
  }
  state.debtPayments = state.debtPayments || [];
  state.debtPayments.push({
    id: uid(),
    date: document.getElementById("debtPaymentDate").value,
    driver,
    amount,
    note: document.getElementById("debtPaymentNote").value.trim()
  });
  saveState();
  event.target.reset();
  renderAll();
});

document.getElementById("purchaseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.purchases.push({
    id: uid(),
    date: document.getElementById("purchaseDate").value,
    item: document.getElementById("purchaseItem").value,
    qty: Number(document.getElementById("purchaseQty").value || 0),
    cost: Number(document.getElementById("purchaseCost").value || 0)
  });
  saveState();
  event.target.reset();
  renderAll();
});

function saveExpenseFromForm(form, type) {
  const prefix = type === "Mensual" ? "monthlyExpense" : "dailyExpense";
  state.expenses.push({
    id: uid(),
    date: document.getElementById(`${prefix}Date`).value,
    category: document.getElementById(`${prefix}Category`).value,
    amount: Number(document.getElementById(`${prefix}Amount`).value || 0),
    type,
    note: document.getElementById(`${prefix}Note`).value.trim()
  });
  saveState();
  form.reset();
  renderAll();
}

document.getElementById("dailyExpenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveExpenseFromForm(event.target, "Diario");
});

document.getElementById("monthlyExpenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveExpenseFromForm(event.target, "Mensual");
});

document.getElementById("debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.liabilityDebts = state.liabilityDebts || [];
  state.liabilityDebts.push({
    id: uid(),
    date: document.getElementById("debtDate").value,
    name: document.getElementById("debtName").value.trim(),
    amount: Number(document.getElementById("debtAmount").value || 0),
    note: document.getElementById("debtNote").value.trim()
  });
  saveState();
  event.target.reset();
  renderAll();
});

document.getElementById("debtInstallmentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const debtId = document.getElementById("debtInstallmentDebt").value;
  const amount = Number(document.getElementById("debtInstallmentAmount").value || 0);
  if (!debtId) {
    alert("Elegí una deuda pendiente.");
    return;
  }
  if (amount <= 0) {
    alert("Poné el monto pagado.");
    return;
  }
  state.liabilityPayments = state.liabilityPayments || [];
  state.liabilityPayments.push({
    id: uid(),
    date: document.getElementById("debtInstallmentDate").value,
    debtId,
    amount,
    note: document.getElementById("debtInstallmentNote").value.trim()
  });
  saveState();
  event.target.reset();
  renderAll();
});

document.getElementById("configForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const numeric = ["initialBottles", "initialCaps", "initialLabels", "initialSeals", "initialGasoline", "initialDiesel", "priceDriver", "priceDriver6", "priceDriver7", "priceDirect6", "priceDirect7", "priceDirect8", "priceDirect10", "gasolineSalePrice", "costCap", "costLabel", "costSeal", "gasolineLiterCost", "dieselLiterCost", "productionEmployee1Commission", "productionEmployee2Commission", "monthlyDepreciation", "lostCharge", "lowStock"];
  numeric.forEach((key) => {
    state.config[key] = Number(document.getElementById(key).value || 0);
  });
  state.config.commission = Number(state.config.productionEmployee1Commission || 0) + Number(state.config.productionEmployee2Commission || 0);
  state.config.drivers = document.getElementById("drivers").value.split(",").map((item) => item.trim()).filter(Boolean);
  saveState();
  renderAll();
  alert("Configuración guardada.");
});

document.getElementById("supabaseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  supabaseConfig = {
    url: document.getElementById("supabaseUrl").value.trim(),
    anonKey: document.getElementById("supabaseAnonKey").value.trim(),
    table: document.getElementById("supabaseTable").value.trim() || "water_app_state",
    rowId: document.getElementById("supabaseRowId").value.trim() || "cantaritooo"
  };
  supabaseClient = null;
  saveSupabaseConfig();
  loadSupabaseForm();
  await loadFromSupabase();
  alert("Conexión de Supabase guardada.");
});

document.getElementById("syncNowBtn").addEventListener("click", async () => {
  if (!hasSupabaseConfig()) {
    alert("Primero guardá la URL y la anon public key de Supabase.");
    return;
  }
  await loadFromSupabase();
  await saveToSupabase();
});

document.getElementById("clearSupabaseBtn").addEventListener("click", () => {
  if (!confirm("¿Quitar la conexión con Supabase de este navegador? Los datos locales no se borran.")) return;
  localStorage.removeItem(SUPABASE_CONFIG_KEY);
  supabaseConfig = loadSupabaseConfig();
  supabaseClient = null;
  loadSupabaseForm();
});

document.addEventListener("click", (event) => {
  const target = event.target;

  if (target.dataset.deleteDay) {
    const day = state.daily.find((item) => item.id === target.dataset.deleteDay);
    if (!day) return;
    if (isOlderThan4Days(day.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar este registro diario?")) return;
    state.daily = state.daily.filter((item) => item.id !== target.dataset.deleteDay);
    saveState();
    renderAll();
  }

  if (target.dataset.editDay) {
    const day = state.daily.find((item) => item.id === target.dataset.editDay);
    if (!day) return;
    if (isOlderThan4Days(day.date) && !confirmProtected()) return;
    document.getElementById("dailyId").value = day.id;
    ["date", "produced", "capsDelivered", "labelsDelivered", "sealsDelivered", "capsUsed", "labelsUsed", "sealsUsed", "direct6", "direct7", "direct8", "direct10", "physicalBottlesSold", "physicalBottleUnitPrice", "gasolineSoldLiters", "cash", "qr", "broken", "lost", "gasLiters", "gasCost", "dieselLiters", "dieselCost", "notes"].forEach((id) => {
      document.getElementById(id).value = day[id] ?? "";
    });
    document.getElementById("brokenDriver").value = day.brokenDriver || "";
    document.getElementById("lostDriver").value = day.lostDriver || "";
    document.querySelectorAll(".driverSale6").forEach((input) => {
      input.value = (day.drivers6 || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driverSale7").forEach((input) => {
      input.value = (day.drivers7 || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driverGas").forEach((input) => {
      input.value = (day.gasByDriver || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driverDiesel").forEach((input) => {
      input.value = (day.dieselByDriver || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driverCash").forEach((input) => {
      input.value = (day.cashByDriver || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driverQr").forEach((input) => {
      input.value = (day.qrByDriver || {})[input.dataset.driver] || 0;
    });
    document.querySelectorAll(".driver-panel").forEach((panel) => { panel.open = true; });
    document.querySelector('[data-view="registro"]').click();
  }

  if (target.dataset.deletePurchase) {
    const purchase = state.purchases.find((item) => item.id === target.dataset.deletePurchase);
    if (!purchase) return;
    if (isOlderThan4Days(purchase.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar esta compra?")) return;
    state.purchases = state.purchases.filter((item) => item.id !== target.dataset.deletePurchase);
    saveState();
    renderAll();
  }

  if (target.dataset.deleteExpense) {
    const expense = state.expenses.find((item) => item.id === target.dataset.deleteExpense);
    if (!expense) return;
    if (isOlderThan4Days(expense.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar este gasto?")) return;
    state.expenses = state.expenses.filter((item) => item.id !== target.dataset.deleteExpense);
    saveState();
    renderAll();
  }

  if (target.dataset.deleteDebtPayment) {
    const payment = (state.debtPayments || []).find((item) => item.id === target.dataset.deleteDebtPayment);
    if (!payment) return;
    if (isOlderThan4Days(payment.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar este pago de deuda?")) return;
    state.debtPayments = (state.debtPayments || []).filter((item) => item.id !== target.dataset.deleteDebtPayment);
    saveState();
    renderAll();
  }

  if (target.dataset.deleteLiabilityDebt) {
    const debt = (state.liabilityDebts || []).find((item) => item.id === target.dataset.deleteLiabilityDebt);
    if (!debt) return;
    if (isOlderThan4Days(debt.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar esta deuda y sus pagos?")) return;
    state.liabilityDebts = (state.liabilityDebts || []).filter((item) => item.id !== target.dataset.deleteLiabilityDebt);
    state.liabilityPayments = (state.liabilityPayments || []).filter((item) => item.debtId !== target.dataset.deleteLiabilityDebt);
    saveState();
    renderAll();
  }

  if (target.dataset.deleteLiabilityPayment) {
    const payment = (state.liabilityPayments || []).find((item) => item.id === target.dataset.deleteLiabilityPayment);
    if (!payment) return;
    if (isOlderThan4Days(payment.date) && !confirmProtected()) return;
    if (!confirm("¿Borrar este pago de deuda?")) return;
    state.liabilityPayments = (state.liabilityPayments || []).filter((item) => item.id !== target.dataset.deleteLiabilityPayment);
    saveState();
    renderAll();
  }
});

["filterFrom", "filterTo", "filterDriver"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderReports);
});

["expenseFilterType", "expenseFilterCategory", "expenseFilterFrom", "expenseFilterTo"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderExpenseFilter);
});

document.getElementById("dailySpendDate").addEventListener("input", renderDailySpendSummary);

document.getElementById("todaySpendBtn").addEventListener("click", () => {
  document.getElementById("dailySpendDate").value = todayIso();
  renderDailySpendSummary();
});

["dashFrom", "dashTo"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    renderKpis();
    renderDriverSummary();
    renderDriverBonification();
    renderProductionSupplySummary();
    renderCostPerBottleSummary();
  });
});

document.getElementById("clearDashFilter").addEventListener("click", () => {
  document.getElementById("dashFrom").value = "";
  document.getElementById("dashTo").value = "";
  renderKpis();
  renderDriverSummary();
  renderDriverBonification();
  renderProductionSupplySummary();
  renderCostPerBottleSummary();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `respaldo-sistema-agua-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    state = JSON.parse(text);
    saveState();
    renderAll();
    alert("Respaldo importado correctamente.");
  } catch {
    alert("No pude importar ese archivo. Revisá que sea un respaldo JSON.");
  }
});

document.getElementById("printBtn").addEventListener("click", () => window.print());

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Esto borra todos los registros guardados en este navegador. ¿Continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaults);
  renderAll();
});

const PASSWORD = "Momoqui68";

function initLock() {
  const lock = document.getElementById("lockScreen");
  const app = document.getElementById("appContent");
  const btn = document.getElementById("lockBtn");
  const input = document.getElementById("lockInput");
  const error = document.getElementById("lockError");

  if (sessionStorage.getItem("auth") === "ok") {
    lock.style.display = "none";
    app.style.display = "block";
    renderAll();
    if (hasSupabaseConfig()) loadFromSupabase();
    return;
  }

  function tryUnlock() {
    if (input.value === PASSWORD) {
      sessionStorage.setItem("auth", "ok");
      lock.style.display = "none";
      app.style.display = "block";
      renderAll();
      if (hasSupabaseConfig()) loadFromSupabase();
    } else {
      error.style.display = "block";
      input.value = "";
      input.focus();
    }
  }

  btn.addEventListener("click", tryUnlock);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

function initDarkMode() {
  const btn = document.getElementById("darkModeBtn");
  const isDark = localStorage.getItem("darkMode") === "1";
  if (isDark) {
    document.body.classList.add("dark");
    btn.textContent = "Modo claro";
  }
  btn.addEventListener("click", () => {
    const active = document.body.classList.toggle("dark");
    localStorage.setItem("darkMode", active ? "1" : "0");
    btn.textContent = active ? "Modo claro" : "Modo oscuro";
    if (salesChartInstance) {
      salesChartInstance.options.scales.x.ticks.color = active ? "#7aaac4" : "#666";
      salesChartInstance.options.scales.y.ticks.color = active ? "#7aaac4" : "#666";
      salesChartInstance.data.datasets[0].backgroundColor = "#5bbfd4";
      salesChartInstance.update();
    }
  });
}

initDarkMode();
initLock();
