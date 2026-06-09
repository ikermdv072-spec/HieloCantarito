const storeKey = "empresaHieloExcelLikeV2";
const SB_BUILTIN_URL = "https://fahctprulsptzyhiuzof.supabase.co";
const SB_BUILTIN_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhaGN0cHJ1bHNwdHp5aGl1em9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDkyODUsImV4cCI6MjA5NjU4NTI4NX0.Whq70aa9nbV0xBO8BqPJFhdvM8F73HQzU9I8ylex4rc";
const today = new Date().toISOString().slice(0, 10);
const monthNow = today.slice(0, 7);
const money = v => `Bs ${Number(v || 0).toFixed(2)}`;
const n = v => Number(v || 0);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`;
let editMode = {};
const products = ["1 kg", "3 kg", "Barra"];
const productId = p => p === "1 kg" ? "p1" : p === "3 kg" ? "p3" : "bar";
const byDateDesc = (a, b) => String(b.date || b.month).localeCompare(String(a.date || a.month));
const empty = () => document.getElementById("emptyTpl").innerHTML;

const starter = {
  businessName: "Empresa de Hielo",
  config: {
    products: {
      "1 kg": { price: 3, packCost: 0.30, kg: 1, notes: "Bolsa chica; precio editable" },
      "3 kg": { price: 9, packCost: 0.48, kg: 3, notes: "Bolsa grande; precio editable" },
      "Barra": { price: 11, packCost: 0, kg: 14, notes: "Sin bolsa de empaque" }
    },
    capCubes: 70, capBars: 28, kgBar: 14, blackBagCost: 0.40, blackBagUnit1: 10, blackBagUnit3: 8, creditClient: "La Familia",
    stockInicial: { b1: 0, b3: 0, black: 0, ice1: 0, ice3: 0, bar: 0 }
  },
  sales: [], productions: [], losses: [], bagMoves: [], bagPurchases: [], payments: [], fuels: [], expenses: [], fixedExpenses: []
};
let state = load();

function load(){ try { return merge(starter, JSON.parse(localStorage.getItem(storeKey) || "{}")); } catch { return structuredClone(starter); } }
function merge(base, incoming){
  const out = structuredClone(base);
  for (const k of Object.keys(incoming || {})) {
    if (incoming[k] && typeof incoming[k] === "object" && !Array.isArray(incoming[k]) && out[k]) out[k] = merge(out[k], incoming[k]);
    else out[k] = incoming[k];
  }
  return out;
}
function save(){ localStorage.setItem(storeKey, JSON.stringify(state)); autoSyncToSupabase(); }
function monthStart(m){ return `${m}-01`; }
function nextMonth(m){ const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,7); }
function inDay(x, d){ return x.date === d; }
function inMonth(x, m){ return String(x.date || x.month || "").slice(0,7) === m; }
function inRange(x, from, to){ const d = x.date || x.month || ""; return (!from || d >= from) && (!to || d < to); }
function weekRange(date){ const d = new Date(`${date}T00:00:00`); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); const from = d.toISOString().slice(0,10); d.setDate(d.getDate()+7); return [from, d.toISOString().slice(0,10)]; }
function dayName(date){ return date ? new Date(`${date}T00:00:00`).toLocaleDateString("es-BO", { weekday: "long" }) : ""; }
function workSales(date){ return new Date(`${date}T00:00:00`).getDay() === 0 ? "No ventas - solo sacar barras" : "Sí"; }
function clientName(s){ return s.client === "Otro" ? (s.clientOther || "Otro") : s.client; }
function cfg(p){ return state.config.products[p]; }
function blackUnitCost(p){ return p === "1 kg" ? state.config.blackBagCost / state.config.blackBagUnit1 : p === "3 kg" ? state.config.blackBagCost / state.config.blackBagUnit3 : 0; }
function directUnitCost(p){ return cfg(p).packCost + blackUnitCost(p); }
function saleCalc(s){
  const price = n(s.price || cfg(s.product).price); const qty = n(s.qty); const bonus = n(s.bonus1kg);
  const total = qty * price;
  const kgMoved = s.product === "1 kg" ? qty + bonus : s.product === "3 kg" ? qty * 3 : qty * state.config.kgBar;
  const packCost = s.product === "1 kg" ? (qty + bonus) * cfg("1 kg").packCost : s.product === "3 kg" ? qty * cfg("3 kg").packCost : 0;
  const blackBags = s.product === "1 kg" ? Math.ceil((qty + bonus) / state.config.blackBagUnit1) : s.product === "3 kg" ? Math.ceil(qty / state.config.blackBagUnit3) : 0;
  const blackCost = blackBags * state.config.blackBagCost;
  const direct = packCost + blackCost;
  const paidNow = s.status === "Pagado" ? total : 0;
  const familyCredit = clientName(s) === state.config.creditClient ? total : 0;
  return { price, total, kgMoved, packCost, blackBags, blackCost, direct, paidNow, familyCredit };
}
function prodCalc(p){
  const kgPacked = n(p.bags1) + n(p.bags3) * 3;
  return { kgPacked, cubeDiff: state.config.capCubes - kgPacked, kgBars: n(p.bars) * state.config.kgBar, barDiff: state.config.capBars - n(p.bars) };
}
function fuelCalc(f, prior=0){ const buy = n(f.litersBought)*n(f.buyPrice); const used = n(f.litersUsed)*n(f.usePrice); return { buy, used, balance: prior+n(f.litersBought)-n(f.litersUsed) }; }
function fixedTotal(x){ return n(x.luz)+n(x.personal)+n(x.internet)+n(x.mantenimiento)+n(x.telefono)+n(x.otros); }
function indirectCosts(month){ return state.expenses.filter(x=>inMonth(x,month)).reduce((s,x)=>s+n(x.amount),0)+state.fixedExpenses.filter(x=>x.month===month).reduce((s,x)=>s+fixedTotal(x),0)+state.fuels.filter(x=>inMonth(x,month)).reduce((s,x)=>s+fuelCalc(x).used,0); }
function kgSold(month){ return state.sales.filter(x=>inMonth(x,month)).reduce((s,x)=>s+saleCalc(x).kgMoved,0); }
function fullUnitCost(p, month){ const indirectKg = kgSold(month) ? indirectCosts(month)/kgSold(month) : 0; return directUnitCost(p) + cfg(p).kg * indirectKg; }
function inventoryIceRows(){
  const dates = [...new Set([...state.productions, ...state.sales, ...state.losses].map(x=>x.date).filter(Boolean))].sort();
  const si = state.config.stockInicial || {};
  let stock = { "1 kg": n(si.ice1), "3 kg": n(si.ice3), "Barra": n(si.bar) };
  return dates.map(date => {
    const prod = state.productions.filter(x=>x.date===date).reduce((a,p)=>({ p1:a.p1+n(p.bags1), p3:a.p3+n(p.bags3), bar:a.bar+n(p.bars)}),{p1:0,p3:0,bar:0});
    const sold = state.sales.filter(x=>x.date===date).reduce((a,s)=>({ p1:a.p1+(s.product==="1 kg"?n(s.qty):0), p3:a.p3+(s.product==="3 kg"?n(s.qty):0), bar:a.bar+(s.product==="Barra"?n(s.qty):0), bonus:a.bonus+n(s.bonus1kg)}),{p1:0,p3:0,bar:0,bonus:0});
    const lost = state.losses.filter(x=>x.date===date).reduce((a,l)=>({ p1:a.p1+n(l.lost1), p3:a.p3+n(l.lost3), bar:a.bar+n(l.lostBars)}),{p1:0,p3:0,bar:0});
    stock["1 kg"] += prod.p1 - sold.p1 - sold.bonus - lost.p1; stock["3 kg"] += prod.p3 - sold.p3 - lost.p3; stock.Barra += prod.bar - sold.bar - lost.bar;
    return { date, prod, sold, lost, stock: {...stock} };
  }).sort(byDateDesc);
}
function latestIceStock(){ const rows = inventoryIceRows().sort((a,b)=>String(a.date).localeCompare(String(b.date))); return rows.at(-1)?.stock || {"1 kg":0,"3 kg":0,Barra:0}; }
function inventoryBagRows(){
  const dates = [...new Set([...state.bagPurchases, ...state.bagMoves, ...state.sales].map(x=>x.date).filter(Boolean))].sort();
  const si0 = state.config.stockInicial || {};
  let stock = { b1: n(si0.b1), b3: n(si0.b3), black: n(si0.black) };
  return dates.map(date => {
    const pur = state.bagPurchases.filter(x=>x.date===date).reduce((a,x)=>({qty1:a.qty1+n(x.qty1),qty3:a.qty3+n(x.qty3),qtyBlack:a.qtyBlack+n(x.qtyBlack)}),{qty1:0,qty3:0,qtyBlack:0});
    const del = state.bagMoves.filter(x=>x.date===date).reduce((a,x)=>({del1:a.del1+n(x.del1),ret1:a.ret1+n(x.ret1),del3:a.del3+n(x.del3),ret3:a.ret3+n(x.ret3),fail1:a.fail1+n(x.fail1),fail3:a.fail3+n(x.fail3),usedBlack:a.usedBlack+n(x.usedBlack)}),{del1:0,ret1:0,del3:0,ret3:0,fail1:0,fail3:0,usedBlack:0});
    const blackFromSales = state.sales.filter(x=>x.date===date).reduce((a,s)=>a+saleCalc(s).blackBags,0);
    const blackUsed = del.usedBlack > 0 ? del.usedBlack : blackFromSales;
    stock.b1 += pur.qty1 - del.del1 + del.ret1 - del.fail1;
    stock.b3 += pur.qty3 - del.del3 + del.ret3 - del.fail3;
    stock.black += pur.qtyBlack - blackUsed;
    return { date, pur, del, blackUsed, stock:{...stock} };
  }).sort(byDateDesc);
}
function latestBagStock(){ const rows = inventoryBagRows().sort((a,b)=>String(a.date).localeCompare(String(b.date))); return rows.at(-1)?.stock || {b1:0,b3:0,black:0}; }
function familyMonths(){
  const months = [...new Set([...state.sales.filter(s=>clientName(s)===state.config.creditClient).map(s=>s.date.slice(0,7)), ...state.payments.filter(p=>p.client===state.config.creditClient).map(p=>p.month)].filter(Boolean))].sort();
  return months.map(month => {
    const sales = state.sales.filter(s=>clientName(s)===state.config.creditClient && inMonth(s, month));
    const p1 = sales.filter(s=>s.product==="1 kg").reduce((a,s)=>a+saleCalc(s).total,0);
    const p3 = sales.filter(s=>s.product==="3 kg").reduce((a,s)=>a+saleCalc(s).total,0);
    const bar = sales.filter(s=>s.product==="Barra").reduce((a,s)=>a+saleCalc(s).total,0);
    const total = p1+p3+bar; const paid = state.payments.filter(p=>p.client===state.config.creditClient && p.month===month).reduce((a,p)=>a+n(p.amount),0);
    return { month, p1, p3, bar, total, paid, debt: total-paid, status: total-paid <= 0 && total > 0 ? "Pagado" : "Pendiente" };
  }).sort((a,b)=>b.month.localeCompare(a.month));
}
function totals(from, to){
  const sales = state.sales.filter(x=>inRange(x,from,to));
  const expenses = state.expenses.filter(x=>inRange(x,from,to)).reduce((a,x)=>a+n(x.amount),0);
  const fixed = state.fixedExpenses.filter(x=>inRange({month:x.month},from?.slice(0,7),to?.slice(0,7))).reduce((a,x)=>a+fixedTotal(x),0);
  const fuel = state.fuels.filter(x=>inRange(x,from,to)).reduce((a,x)=>a+fuelCalc(x).used,0);
  const venta = sales.reduce((a,s)=>a+saleCalc(s).total,0), cobrado = sales.reduce((a,s)=>a+saleCalc(s).paidNow,0), credit = sales.reduce((a,s)=>a+saleCalc(s).familyCredit,0), direct = sales.reduce((a,s)=>a+saleCalc(s).direct,0);
  return { venta, cobrado, credit, direct, expenses, fixed, fuel, gross: venta-direct, net: venta-direct-expenses-fixed-fuel };
}

function startEdit(formId, collection, id) {
  const rec = state[collection].find(x => x.id === id);
  if (!rec) return;
  const form = document.getElementById(formId);
  Object.keys(rec).forEach(k => { const el = form.elements[k]; if (el) el.value = rec[k]; });
  editMode[formId] = { collection, id };
  const btn = form.querySelector(".primary");
  if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
  btn.textContent = "Actualizar";
  form.querySelector(".cancel-edit-btn").hidden = false;
  const viewId = form.closest(".view")?.id;
  if (viewId) switchView(viewId);
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function cancelEdit(formId) {
  const form = document.getElementById(formId);
  delete editMode[formId];
  form.reset();
  setDefaults(form);
  const btn = form.querySelector(".primary");
  btn.textContent = btn.dataset.origText || "Guardar";
  form.querySelector(".cancel-edit-btn").hidden = true;
}
function render(){
  document.getElementById("businessName").value = state.businessName;
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("es-BO", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  renderDashboard(); renderSales(); renderProduction(); renderIce(); renderBags(); renderFamily(); renderFuel(); renderExpenses(); renderCosts(); renderReports(); renderConfig(); save();
}
function renderDashboard(){
  const d = document.getElementById("analysisDate").value || today, m = document.getElementById("analysisMonth").value || monthNow;
  const dayT = totals(d, nextDay(d)), monT = totals(monthStart(m), monthStart(nextMonth(m)));
  document.getElementById("dashSalesDay").textContent = money(dayT.venta); document.getElementById("dashPaidDay").textContent = money(dayT.cobrado); document.getElementById("dashSalesMonth").textContent = money(monT.venta); document.getElementById("dashFamilyDebt").textContent = money(familyMonths().reduce((a,x)=>a+x.debt,0));
  const stock = latestIceStock();
  document.getElementById("dashProductRows").innerHTML = products.map(p=>`<tr><td>${p}</td><td>${stock[p]}</td><td>${state.sales.filter(s=>s.product===p&&inMonth(s,m)).reduce((a,s)=>a+n(s.qty),0)}</td><td>${money(fullUnitCost(p,m))}</td><td>${money(cfg(p).price-fullUnitCost(p,m))}</td></tr>`).join("");
  const bags = latestBagStock();
  const buyMonth = state.bagPurchases.filter(x=>inMonth(x,m)).reduce((a,x)=>({b1:a.b1+n(x.qty1),b3:a.b3+n(x.qty3),black:a.black+n(x.qtyBlack)}),{b1:0,b3:0,black:0});
  const usedMonth = inventoryBagRows().filter(r=>inMonth(r,m)).reduce((a,r)=>({b1:a.b1+r.del.del1-r.del.ret1+r.del.fail1,b3:a.b3+r.del.del3-r.del.ret3+r.del.fail3,black:a.black+r.blackUsed}),{b1:0,b3:0,black:0});
  document.getElementById("dashSupplyRows").innerHTML = [["Bolsas 1kg",bags.b1,buyMonth.b1,usedMonth.b1],["Bolsas 3kg",bags.b3,buyMonth.b3,usedMonth.b3],["Bolsas negras",bags.black,buyMonth.black,usedMonth.black]].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>Control admin-producción</td></tr>`).join("");
}
function nextDay(d){ const x=new Date(`${d}T00:00:00`); x.setDate(x.getDate()+1); return x.toISOString().slice(0,10); }
function renderSales(){
  const term = document.getElementById("saleSearch").value.toLowerCase();
  const rows = state.sales.filter(s=>`${clientName(s)} ${s.product}`.toLowerCase().includes(term)).sort(byDateDesc);
  document.getElementById("saleRows").innerHTML = rows.length ? rows.map(s=>{ const c=saleCalc(s); return `<tr><td>${s.date}</td><td>${clientName(s)}</td><td>${s.product}</td><td>${s.qty}</td><td>${money(c.total)}</td><td>${c.kgMoved}</td><td>${money(c.direct)}</td><td>${money(c.paidNow)}</td><td>${money(c.familyCredit)}</td><td><button class="edit-btn" data-edit="saleForm:sales:${s.id}">Editar</button><button class="danger-btn" data-del="sales:${s.id}">Borrar</button></td></tr>` }).join("") : `<tr><td colspan="10">${empty()}</td></tr>`;
}
function renderProduction(){
  const rows = state.productions.sort(byDateDesc);
  document.getElementById("prodRows").innerHTML = rows.length ? rows.map(p=>{ const c=prodCalc(p); return `<tr><td>${p.date}</td><td>${dayName(p.date)}</td><td>${workSales(p.date)}</td><td>${c.kgPacked}</td><td class="${c.cubeDiff<0?'negative':'positive'}">${c.cubeDiff}</td><td>${p.bars}</td><td class="${c.barDiff<0?'negative':'positive'}">${c.barDiff}</td><td><button class="edit-btn" data-edit="prodForm:productions:${p.id}">Editar</button><button class="danger-btn" data-del="productions:${p.id}">Borrar</button></td></tr>` }).join("") : `<tr><td colspan="8">${empty()}</td></tr>`;
}
function renderIce(){ const rows=inventoryIceRows(); document.getElementById("iceRows").innerHTML = rows.length ? rows.map(r=>`<tr><td>${r.date}</td><td>${r.prod.p1}</td><td>${r.prod.p3}</td><td>${r.prod.bar}</td><td>${r.sold.p1}</td><td>${r.sold.p3}</td><td>${r.sold.bar}</td><td>${r.sold.bonus}</td><td>${r.lost.p1+r.lost.p3+r.lost.bar}</td><td>${r.stock["1 kg"]}</td><td>${r.stock["3 kg"]}</td><td>${r.stock.Barra}</td></tr>`).join("") : `<tr><td colspan="12">${empty()}</td></tr>`; }
function renderBags(){ const rows=inventoryBagRows(); document.getElementById("bagsRows").innerHTML = rows.length ? rows.map(r=>`<tr><td>${r.date}</td><td>${r.pur.qty1}</td><td>${r.pur.qty3}</td><td>${r.pur.qtyBlack}</td><td>${r.del.del1}</td><td>${r.del.ret1}</td><td>${r.del.del3}</td><td>${r.del.ret3}</td><td>${r.del.fail1+r.del.fail3}</td><td>${r.blackUsed}</td><td>${r.stock.b1}</td><td>${r.stock.b3}</td><td>${r.stock.black}</td></tr>`).join("") : `<tr><td colspan="13">${empty()}</td></tr>`; }
function renderFamily(){
  const m = document.getElementById("analysisMonth").value || monthNow;
  const rows = familyMonths();
  const cur = rows.find(r=>r.month===m) || {p1:0,p3:0,bar:0,total:0,paid:0,debt:0};
  const totalDebt = rows.reduce((a,r)=>a+r.debt,0);
  document.getElementById("famTotalDebt").textContent = money(totalDebt);
  document.getElementById("famMonthSales").textContent = money(cur.total);
  document.getElementById("famMonthPaid").textContent = money(cur.paid);
  document.getElementById("famCurrentMonth").textContent = m;
  document.getElementById("famDebt1kg").textContent = money(cur.p1);
  document.getElementById("famDebt3kg").textContent = money(cur.p3);
  document.getElementById("famDebtBar").textContent = money(cur.bar);
  document.getElementById("famDebtTotal").textContent = money(cur.total);
  document.getElementById("famDebtPaid").textContent = money(cur.paid);
  const balEl = document.getElementById("famDebtBalance");
  balEl.textContent = money(cur.debt);
  balEl.className = cur.debt > 0 ? "negative" : cur.debt < 0 ? "positive" : "";
  document.getElementById("familyRows").innerHTML = rows.length ? rows.map(r=>`<tr><td>${r.month}</td><td>${money(r.p1)}</td><td>${money(r.p3)}</td><td>${money(r.bar)}</td><td>${money(r.total)}</td><td>${money(r.paid)}</td><td class="${r.debt>0?'negative':r.debt<0?'positive':''}">${money(r.debt)}</td><td><span class="badge ${r.status==='Pagado'?'good':'warn'}">${r.status}</span></td></tr>`).join("") : `<tr><td colspan="8">${empty()}</td></tr>`;
  const famPayments = state.payments.filter(p=>(p.client||"")===state.config.creditClient).sort(byDateDesc);
  document.getElementById("famPaymentRows").innerHTML = famPayments.length ? famPayments.map(p=>`<tr><td>${p.date}</td><td>${p.month}</td><td>${money(p.amount)}</td><td>${p.method}</td><td><button class="edit-btn" data-edit="paymentForm:payments:${p.id}">Editar</button><button class="danger-btn" data-del="payments:${p.id}">Borrar</button></td></tr>`).join("") : `<tr><td colspan="5">${empty()}</td></tr>`;
}
function renderPayments(){ const rows=state.payments.sort(byDateDesc); document.getElementById("paymentRows").innerHTML = rows.length ? rows.map(p=>`<tr><td>${p.date}</td><td>${p.client}</td><td>${p.month}</td><td>${money(p.amount)}</td><td>${p.method}</td><td><button class="edit-btn" data-edit="paymentForm:payments:${p.id}">Editar</button><button class="danger-btn" data-del="payments:${p.id}">Borrar</button></td></tr>`).join("") : `<tr><td colspan="6">${empty()}</td></tr>`; }
function renderFuel(){ let bal=0; const asc=[...state.fuels].sort((a,b)=>String(a.date).localeCompare(String(b.date))); const calcs={}; asc.forEach(f=>{ const c=fuelCalc(f,bal); bal=c.balance; calcs[f.id]=c; }); const rows=[...state.fuels].sort(byDateDesc); document.getElementById("fuelRows").innerHTML = rows.length ? rows.map(f=>`<tr><td>${f.date}</td><td>${f.litersBought}</td><td>${money(calcs[f.id].buy)}</td><td>${f.litersUsed}</td><td>${money(calcs[f.id].used)}</td><td>${calcs[f.id].balance.toFixed(2)}</td><td><button class="edit-btn" data-edit="fuelForm:fuels:${f.id}">Editar</button><button class="danger-btn" data-del="fuels:${f.id}">Borrar</button></td></tr>`).join("") : `<tr><td colspan="7">${empty()}</td></tr>`; }
function renderExpenses(){ document.getElementById("expenseRows").innerHTML = state.expenses.length ? state.expenses.sort(byDateDesc).map(e=>`<tr><td>${e.date}</td><td>${e.category}</td><td>${e.description||'-'}</td><td>${money(e.amount)}</td><td><button class="edit-btn" data-edit="expenseForm:expenses:${e.id}">Editar</button><button class="danger-btn" data-del="expenses:${e.id}">Borrar</button></td></tr>`).join("") : `<tr><td colspan="5">${empty()}</td></tr>`; document.getElementById("fixedRows").innerHTML = state.fixedExpenses.length ? state.fixedExpenses.sort(byDateDesc).map(f=>`<tr><td>${f.month}</td><td>${money(f.luz)}</td><td>${money(f.personal)}</td><td>${money(f.internet)}</td><td>${money(fixedTotal(f))}</td><td><button class="edit-btn" data-edit="fixedForm:fixedExpenses:${f.id}">Editar</button><button class="danger-btn" data-del="fixedExpenses:${f.id}">Borrar</button></td></tr>`).join("") : `<tr><td colspan="6">${empty()}</td></tr>`; }
function renderCosts(){ const m=document.getElementById("analysisMonth").value || monthNow; const indirect=indirectCosts(m), kg=kgSold(m), indKg=kg?indirect/kg:0; document.getElementById("costMonthLabel").textContent=m; document.getElementById("indirectMonth").textContent=money(indirect); document.getElementById("indirectKg").textContent=money(indKg); document.getElementById("costRows").innerHTML = products.map(p=>{ const complete=fullUnitCost(p,m), gross=cfg(p).price-directUnitCost(p), net=cfg(p).price-complete, margin=cfg(p).price?net/cfg(p).price*100:0; return `<tr><td>${p}</td><td>${money(cfg(p).price)}</td><td>${money(cfg(p).packCost)}</td><td>${money(blackUnitCost(p))}</td><td>${money(directUnitCost(p))}</td><td>${cfg(p).kg}</td><td>${money(complete)}</td><td>${money(gross)}</td><td>${money(net)}</td><td>${margin.toFixed(1)}%</td></tr>` }).join(""); }
function renderReports(){ const d=document.getElementById("analysisDate").value||today, m=document.getElementById("analysisMonth").value||monthNow, y=d.slice(0,4); const [wf,wt]=weekRange(d); const specs=[['Día',d,nextDay(d)],['Semana',wf,wt],['Mes',monthStart(m),monthStart(nextMonth(m))],['Año',`${y}-01-01`,`${Number(y)+1}-01-01`]]; document.getElementById("reportRows").innerHTML = specs.map(([label,from,to])=>{ const t=totals(from,to); return `<tr><td>${label}</td><td>${money(t.venta)}</td><td>${money(t.cobrado)}</td><td>${money(t.credit)}</td><td>${money(t.direct)}</td><td>${money(t.expenses)}</td><td>${money(t.fixed)}</td><td>${money(t.fuel)}</td><td>${money(t.gross)}</td><td>${money(t.net)}</td></tr>` }).join(""); }
function renderConfig(){ document.getElementById("configProductRows").innerHTML = products.map(p=>`<tr><td>${p}</td><td><input data-cfg-product="${p}" data-cfg-field="price" type="number" step="0.01" value="${cfg(p).price}"></td><td><input data-cfg-product="${p}" data-cfg-field="packCost" type="number" step="0.01" value="${cfg(p).packCost}"></td><td><input data-cfg-product="${p}" data-cfg-field="kg" type="number" step="0.01" value="${cfg(p).kg}"></td><td><input data-cfg-product="${p}" data-cfg-field="notes" value="${cfg(p).notes}"></td></tr>`).join(""); ["capCubes","capBars","kgBar","blackBagCost","blackBagUnit1","blackBagUnit3"].forEach(id=>document.getElementById(id).value=state.config[id]); const _si=state.config.stockInicial||{}; [["siB1","b1"],["siB3","b3"],["siBlack","black"],["siIce1","ice1"],["siIce3","ice3"],["siBar","bar"]].forEach(([id,k])=>{ const el=document.getElementById(id); if(el) el.value=n(_si[k]); }); fillSbFields(); }
function getSbCfg(){ const c=JSON.parse(localStorage.getItem("sbConfig")||"{}"); return { url: c.url||SB_BUILTIN_URL, key: c.key||SB_BUILTIN_KEY }; }
function fillSbFields(){ const c=getSbCfg(); const u=document.getElementById("sbUrl"); const k=document.getElementById("sbKey"); if(u) u.value=c.url||""; if(k) k.value=c.key||""; }
function sbSetStatus(msg, cls){ const el=document.getElementById("sbSyncBadge"); if(!el) return; el.textContent=msg; el.className="sb-sync-badge"+(cls?" "+cls:""); }
let _sbTimer=null;
function autoSyncToSupabase(){
  const {url,key}=getSbCfg();
  if(!url||!key) return;
  if(_sbTimer) clearTimeout(_sbTimer);
  sbSetStatus("Sincronizando...","syncing");
  _sbTimer=setTimeout(async()=>{
    if(typeof window.supabase==="undefined"){ sbSetStatus("",""); return; }
    try{
      const sb=window.supabase.createClient(url,key);
      const {error}=await sb.from("sistema_hielo_backup").upsert({id:1,data:state,updated_at:new Date().toISOString()});
      if(error) throw error;
      sbSetStatus("Sincronizado ✓","synced");
    }catch(e){ sbSetStatus("Error sync","sync-err"); }
  },2000);
}
async function initSupabaseSync(){
  const {url,key}=getSbCfg();
  if(!url||!key||typeof window.supabase==="undefined") return;
  try{
    sbSetStatus("Cargando...","syncing");
    const sb=window.supabase.createClient(url,key);
    const {data,error}=await sb.from("sistema_hielo_backup").select("data,updated_at").eq("id",1).single();
    if(!error&&data&&data.data){ state=merge(starter,data.data); render(); }
    sbSetStatus("Sincronizado ✓","synced");
  }catch(e){ sbSetStatus("",""); }
}
function addSubmit(id, collection, mapper){ document.getElementById(id).addEventListener("submit", e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget)); const mode=editMode[id]; if(mode){ const idx=state[collection].findIndex(x=>x.id===mode.id); if(idx!==-1) state[collection][idx]={id:mode.id,...mapper(data)}; cancelEdit(id); } else { state[collection].push({id:uid(),...mapper(data)}); e.currentTarget.reset(); setDefaults(e.currentTarget); } render(); }); }
addSubmit("saleForm","sales",d=>({date:d.date,client:d.client,clientOther:d.clientOther.trim(),product:d.product,qty:n(d.qty),price:n(d.price),method:d.method,status:d.status,bonus1kg:n(d.bonus1kg),notes:d.notes.trim()}));
addSubmit("prodForm","productions",d=>({date:d.date,cubesKg:n(d.cubesKg),bags1:n(d.bags1),bags3:n(d.bags3),bars:n(d.bars),notes:d.notes.trim()}));
addSubmit("lossForm","losses",d=>({date:d.date,lost1:n(d.lost1),lost3:n(d.lost3),lostBars:n(d.lostBars),notes:d.notes.trim()}));
addSubmit("bagBuyForm","bagPurchases",d=>({date:d.date,qty1:n(d.qty1),price1:n(d.price1),qty3:n(d.qty3),price3:n(d.price3),qtyBlack:n(d.qtyBlack),priceBlack:n(d.priceBlack),notes:d.notes.trim()}));
addSubmit("bagsForm","bagMoves",d=>({date:d.date,del1:n(d.del1),ret1:n(d.ret1),del3:n(d.del3),ret3:n(d.ret3),fail1:n(d.fail1),fail3:n(d.fail3),usedBlack:n(d.usedBlack),notes:d.notes.trim()}));
addSubmit("paymentForm","payments",d=>({date:d.date,client:d.client.trim()||"La Familia",month:d.month,amount:n(d.amount),method:d.method,notes:d.notes.trim()}));
addSubmit("fuelForm","fuels",d=>({date:d.date,litersBought:n(d.litersBought),buyPrice:n(d.buyPrice),litersUsed:n(d.litersUsed),usePrice:n(d.usePrice)}));
addSubmit("expenseForm","expenses",d=>({date:d.date,category:d.category,description:d.description.trim(),amount:n(d.amount),method:d.method,notes:d.notes.trim()}));
addSubmit("fixedForm","fixedExpenses",d=>({month:d.month,luz:n(d.luz),personal:n(d.personal),internet:n(d.internet),mantenimiento:n(d.mantenimiento),telefono:n(d.telefono),otros:n(d.otros)}));
function setDefaults(form){ if(form.date) form.date.value=today; if(form.month) form.month.value=monthNow; if(form.product && form.price) form.price.value=cfg(form.product.value).price; }
document.querySelectorAll("form").forEach(setDefaults); document.getElementById("analysisDate").value=today; document.getElementById("analysisMonth").value=monthNow;
document.addEventListener("click", e=>{ const nav=e.target.closest("[data-view],[data-view-link]"); if(nav) switchView(nav.dataset.view||nav.dataset.viewLink); const del=e.target.closest("[data-del]"); if(del&&confirm("¿Borrar este registro?")){ const [col,id]=del.dataset.del.split(":"); state[col]=state[col].filter(x=>x.id!==id); render(); } const edit=e.target.closest("[data-edit]"); if(edit){ const [fId,col,id]=edit.dataset.edit.split(":"); startEdit(fId,col,id); } const cancel=e.target.closest("[data-cancel-edit]"); if(cancel) cancelEdit(cancel.dataset.cancelEdit); });
function switchView(id){ document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id)); document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===id)); document.getElementById("viewTitle").textContent=document.querySelector(`[data-view="${id}"]`)?.textContent||"Dashboard"; }
document.getElementById("businessName").addEventListener("input",e=>{state.businessName=e.target.value;save();});
document.getElementById("saleSearch").addEventListener("input",renderSales); document.getElementById("analysisDate").addEventListener("change",render); document.getElementById("analysisMonth").addEventListener("change",render);
document.querySelector("#saleForm [name=product]").addEventListener("change",e=>{document.querySelector("#saleForm [name=price]").value=cfg(e.target.value).price;});
document.getElementById("saveConfigBtn").addEventListener("click",()=>{ document.querySelectorAll("[data-cfg-product]").forEach(i=>{ const p=i.dataset.cfgProduct, f=i.dataset.cfgField; state.config.products[p][f]=f==="notes"?i.value:n(i.value); }); ["capCubes","capBars","kgBar","blackBagCost","blackBagUnit1","blackBagUnit3"].forEach(id=>state.config[id]=n(document.getElementById(id).value)); state.config.products.Barra.kg=state.config.kgBar; render(); alert("Configuración guardada"); });
document.getElementById("exportBtn").addEventListener("click",()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`respaldo-empresa-hielo-${today}.json`; a.click(); URL.revokeObjectURL(a.href); });
document.getElementById("importFile").addEventListener("change",async e=>{ const file=e.target.files[0]; if(!file)return; state=merge(starter,JSON.parse(await file.text())); render(); });
document.getElementById("demoBtn").addEventListener("click",()=>{ if(!confirm("¿Cargar datos demo? Se reemplazarán los datos actuales."))return; state=demo(); render(); });
function demo(){ const s=structuredClone(starter); s.sales=[{id:uid(),date:today,client:"Trinidad",clientOther:"",product:"3 kg",qty:10,price:9,method:"Efectivo",status:"Pagado",bonus1kg:0,notes:""},{id:uid(),date:today,client:"La Familia",clientOther:"",product:"1 kg",qty:20,price:3,method:"Crédito La Familia",status:"Pendiente",bonus1kg:2,notes:"Promo 10+1"},{id:uid(),date:today,client:"La Familia",clientOther:"",product:"Barra",qty:3,price:11,method:"Crédito La Familia",status:"Pendiente",bonus1kg:0,notes:""}]; s.productions=[{id:uid(),date:today,cubesKg:70,bags1:55,bags3:18,bars:24,notes:"Turno mañana"}]; s.bagPurchases=[{id:uid(),date:today,qty1:500,price1:0.30,qty3:300,price3:0.48,qtyBlack:80,priceBlack:0.40,notes:"Compra inicial"}]; s.bagMoves=[{id:uid(),date:today,del1:55,ret1:0,del3:18,ret3:0,fail1:2,fail3:1,usedBlack:9,notes:"Entrega turno mañana"}]; s.expenses=[{id:uid(),date:today,category:"Mantenimiento",description:"Revisión máquina",amount:120,method:"Efectivo",notes:""}]; s.fixedExpenses=[{id:uid(),month:monthNow,luz:900,personal:3200,internet:180,mantenimiento:150,telefono:80,otros:0}]; s.fuels=[{id:uid(),date:today,litersBought:30,buyPrice:3.74,litersUsed:8,usePrice:3.74}]; return s; }
document.getElementById("saveStockInicialBtn").addEventListener("click",()=>{ state.config.stockInicial={b1:n(document.getElementById("siB1").value),b3:n(document.getElementById("siB3").value),black:n(document.getElementById("siBlack").value),ice1:n(document.getElementById("siIce1").value),ice3:n(document.getElementById("siIce3").value),bar:n(document.getElementById("siBar").value)}; render(); alert("Stock inicial guardado"); });
document.getElementById("saveSbBtn").addEventListener("click",()=>{ const st=document.getElementById("sbStatus"); localStorage.setItem("sbConfig",JSON.stringify({url:document.getElementById("sbUrl").value.trim(),key:document.getElementById("sbKey").value.trim()})); st.textContent="Credenciales guardadas. Reinicia la app para activar la sincronización automática."; st.className="sb-status good-msg"; });
document.getElementById("pushSbBtn").addEventListener("click",async()=>{ const {url,key}=getSbCfg(); const st=document.getElementById("sbStatus"); if(!url||!key){ st.textContent="Guarda primero las credenciales."; return; } if(typeof window.supabase==="undefined"){ st.textContent="Librería Supabase no disponible. Verifica tu conexión a internet."; return; } try{ st.textContent="Subiendo datos..."; st.className="sb-status"; const sb=window.supabase.createClient(url,key); const {error}=await sb.from("sistema_hielo_backup").upsert({id:1,data:state,updated_at:new Date().toISOString()}); if(error) throw error; st.textContent="Datos subidos correctamente ✓"; st.className="sb-status good-msg"; }catch(e){ st.textContent="Error: "+e.message; st.className="sb-status"; } });
document.getElementById("pullSbBtn").addEventListener("click",async()=>{ const {url,key}=getSbCfg(); const st=document.getElementById("sbStatus"); if(!url||!key){ st.textContent="Guarda primero las credenciales."; return; } if(typeof window.supabase==="undefined"){ st.textContent="Librería Supabase no disponible."; return; } if(!confirm("¿Reemplazar datos locales con los datos guardados en Supabase?")) return; try{ st.textContent="Descargando datos..."; st.className="sb-status"; const sb=window.supabase.createClient(url,key); const {data,error}=await sb.from("sistema_hielo_backup").select("data").eq("id",1).single(); if(error) throw error; state=merge(starter,data.data); render(); st.textContent="Datos descargados correctamente ✓"; st.className="sb-status good-msg"; }catch(e){ st.textContent="Error: "+e.message; st.className="sb-status"; } });
render();
initSupabaseSync();
