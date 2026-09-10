import type { Ctx, View } from '../app';
import { playerBusinesses, playerCompany } from '../../sim/state';
import { directorState, currentScenario, explainBusiness, resolveScenario } from '../../sim/director';
import { money, moneySigned, pct } from '../../sim/format';
import { empty, h, section, stat, table, button, toast } from '../dom';

export function directorView(ctx: Ctx): View {
  const state = ctx.state; const d = directorState(state); const company = playerCompany(state);
  const open = playerBusinesses(state).filter(b => b.status === 'open'); const scenario = currentScenario(state);
  const el = h('div', { class:'view' });
  el.appendChild(h('div',{class:'page-head'},h('div',{},h('h1',{text:'Management Director'}),h('p',{class:'muted',text:'See what is happening, why it is happening, and what deserves your attention next.'}))));
  el.appendChild(h('div',{class:'stat-grid'},stat('7-day revenue forecast',money(d.forecast.revenue)),stat('7-day profit forecast',moneySigned(d.forecast.profit),d.forecast.profit>=0?'good':'bad'),stat('Projected cash',money(d.forecast.cash),d.forecast.cash>=0?'good':'bad'),stat('Open businesses',String(open.length))));

  if(scenario){
    const panel=section(`Decision required · ${scenario.title}`,h('p',{text:scenario.description}),h('p',{class:'tiny muted',text:`Choose an action before day ${d.scenarioEndsOnDay}. Your choice is recorded and affects the company.`}),h('div',{class:'btn-row'},button('Invest',()=>{resolveScenario(state,'invest');toast('Decision applied','good');ctx.refresh();},'btn primary'),button('Protect cash',()=>{resolveScenario(state,'protect');toast('Cash protected','info');ctx.refresh();},'btn ghost'),button('Ignore',()=>{resolveScenario(state,'ignore');toast('Scenario ignored','info');ctx.refresh();},'btn ghost')));
    el.appendChild(panel);
  } else el.appendChild(section('No active scenario',empty('No major decision is currently waiting for you. Continue the simulation; the director will surface meaningful conditions as they arise.')));

  const rows=open.map(b=>{const reasons=explainBusiness(state,b.id);return[h('span',{text:b.name}),h('span',{class:reasons[0]?.includes('weak')||reasons[0]?.includes('out of stock')?'bad':'good',text:reasons[0]??'Stable'}),h('span',{class:'tiny muted',text:reasons.slice(1,3).join(' ')})];});
  el.appendChild(section('WHY? · Business performance',rows.length?table(['Business','Primary driver','Other signals'],rows):empty('Open a business to receive explainable performance analysis.')));
  const decisionRows=d.decisions.slice(0,12).map(x=>[`Day ${x.day}`,x.title,x.choice,x.consequence]);
  el.appendChild(section('Decision history',decisionRows.length?table(['Day','Scenario','Choice','Consequence'],decisionRows):empty('Your important scenario decisions will appear here.')));
  el.appendChild(section('Director status',stat('Current cash',money(company.cash)),stat('Economy growth',pct(state.economy.growth*100,2)),stat('Inflation',pct((state.economy.inflation-1)*100,2)),d.lastWhy?h('div',{class:'alert-row'},h('span',{class:'alert-dot info'}),h('div',{style:'flex:1'},h('div',{class:'alert-title',text:'Last decision consequence'}),h('div',{class:'alert-detail',text:d.lastWhy}))):empty('No strategic decision has been resolved yet.')));
  return {el};
}
