import type { Ctx, View } from '../app';
import { getRecords, getStories, getWorldDecisions, explainMetric } from '../../sim/living3';
import { playerBusinesses, playerCompany } from '../../sim/state';
import { money, moneySigned } from '../../sim/format';
import { empty, h, section, stat, table } from '../dom';

export function worldView(ctx: Ctx): View {
  const state=ctx.state; const company=playerCompany(state); const businesses=playerBusinesses(state).filter(b=>b.status==='open');
  const stories=getStories(state).slice(0,12); const decisions=getWorldDecisions(state).slice(0,8); const records=getRecords(state);
  const el=h('div',{class:'view'});
  el.appendChild(h('div',{class:'page-head'},h('div',{},h('h1',{text:'Living World'}),h('p',{class:'muted',text:'Your company is part of a changing city. Events, people, markets and decisions leave a history.'}))));
  const revenue=businesses.reduce((n,b)=>n+b.today.revenue,0); const profit=businesses.reduce((n,b)=>n+b.today.revenue-b.today.cogs-b.today.wages-b.today.rent-b.today.marketing-b.today.otherCosts,0); const customers=businesses.reduce((n,b)=>n+b.today.customers,0);
  el.appendChild(h('div',{class:'stat-grid'},stat('Company cash',money(company.cash)),stat('Today revenue',money(revenue)),stat('Today operating profit',moneySigned(profit),profit>=0?'good':'bad'),stat('Customers',String(customers))));
  const feed=section('What is happening');
  if(!stories.length)feed.appendChild(empty('The world has not generated a major story yet. Keep the simulation running.'));
  for(const s of stories)feed.appendChild(h('div',{class:'alert-row'},h('span',{class:`alert-dot ${s.importance>=3?'critical':s.importance===2?'warning':'info'}`}),h('div',{style:'flex:1'},h('div',{class:'alert-title',text:`Day ${s.day} · ${s.category} · ${s.title}`}),h('div',{class:'alert-detail',text:s.detail}))));
  el.appendChild(feed);
  const why=section('WHY? · Current performance');
  for(const metric of ['revenue','profit','customers'] as const)why.appendChild(h('div',{style:'margin-bottom:14px'},h('div',{class:'list-title',text:metric[0].toUpperCase()+metric.slice(1)}),h('div',{class:'tiny muted',text:explainMetric(state,metric).join(' ')})));
  el.appendChild(why);
  const recordRows=Object.entries(records).filter(([,r])=>r.value>0).map(([key,r])=>[key,r.name,String(Math.round(r.value)),`Day ${r.day}`]);
  el.appendChild(section('Company history',recordRows.length?table(['Record','Company','Value','Day'],recordRows):empty('Your first records will appear as the company trades.')));
  const decisionRows=decisions.map(d=>[`Day ${d.day}`,d.title,d.detail]);
  el.appendChild(section('Decisions that shaped the company',decisionRows.length?table(['Day','Decision','Consequence'],decisionRows):empty('Major decisions will build a permanent company history.')));
  return {el};
}
