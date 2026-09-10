import type { GameState } from './state';
import { playerBusinesses, buildingById, companyById } from './state';
import { businessType } from '../data/businessTypes';
import { district } from '../data/districts';
import { clamp, makeId } from './util';
import { pushAlert } from './alerts';

export interface LivingReview {
  id: string;
  day: number;
  businessId: string;
  score: number;
  text: string;
}

export interface LivingNews {
  id: string;
  day: number;
  hour: number;
  category: 'MARKET' | 'COMPETITION' | 'COMPANY' | 'PEOPLE' | 'CITY';
  headline: string;
  detail: string;
}

interface LivingState {
  reviews: LivingReview[];
  news: LivingNews[];
  lastConfidence: number;
  lastInflation: number;
  lastInterest: number;
  lastUnemployment: number;
  lastCompetitorCount: number;
  initialized: boolean;
}

const MAX_ITEMS = 80;

function living(state: GameState): LivingState {
  const root = state as GameState & { living?: LivingState };
  if (!root.living) {
    root.living = {
      reviews: [],
      news: [],
      lastConfidence: state.economy.confidence,
      lastInflation: state.economy.inflation,
      lastInterest: state.economy.interestRate,
      lastUnemployment: state.economy.unemployment,
      lastCompetitorCount: state.businesses.filter((b) => b.companyId !== state.playerCompanyId).length,
      initialized: false,
    };
  }
  return root.living;
}

export function getLivingReviews(state: GameState): LivingReview[] {
  return living(state).reviews;
}

export function getLivingNews(state: GameState): LivingNews[] {
  return living(state).news;
}

function addNews(state: GameState, category: LivingNews['category'], headline: string, detail: string): void {
  const data = living(state);
  data.news.unshift({ id: makeId('news'), day: state.day, hour: state.hour, category, headline, detail });
  if (data.news.length > MAX_ITEMS) data.news.length = MAX_ITEMS;
}

function addReview(state: GameState, businessId: string, score: number, text: string): void {
  const data = living(state);
  data.reviews.unshift({ id: makeId('review'), day: state.day, businessId, score, text });
  if (data.reviews.length > MAX_ITEMS) data.reviews.length = MAX_ITEMS;
}

function reviewText(score: number, quality: number, stockouts: number): string {
  if (score >= 4.6) return quality >= 80 ? 'Excellent service and a genuinely great experience.' : 'Very good experience. I would happily come back.';
  if (score >= 4.0) return stockouts > 0 ? 'Good service, although a few things were unavailable.' : 'Friendly service and a solid experience.';
  if (score >= 3.2) return 'It was fine, but there is room for improvement.';
  if (score >= 2.4) return stockouts > 0 ? 'Too many products were unavailable when I visited.' : 'Service felt slow and inconsistent.';
  return quality < 45 ? 'Poor service. Management needs to step up.' : 'Disappointing experience; I expected better.';
}

function maybeMarketNews(state: GameState): void {
  const data = living(state);
  const e = state.economy;
  if (Math.abs(e.confidence - data.lastConfidence) >= 5) {
    const rising = e.confidence > data.lastConfidence;
    addNews(state, 'MARKET', rising ? 'Consumer confidence is picking up' : 'Consumers are tightening their belts', rising
      ? `Confidence has risen to ${Math.round(e.confidence)}. Discretionary businesses may see stronger demand.`
      : `Confidence has fallen to ${Math.round(e.confidence)}. Price-sensitive sectors should prepare for softer demand.`);
  }
  if (Math.abs(e.interestRate - data.lastInterest) >= 0.005) {
    addNews(state, 'MARKET', e.interestRate > data.lastInterest ? 'Borrowing costs are rising' : 'Credit is getting cheaper', `The base rate moved to ${(e.interestRate * 100).toFixed(2)}%. Financing decisions across Northgate will be affected.`);
  }
  if (Math.abs(e.inflation - data.lastInflation) >= 0.025) {
    addNews(state, 'CITY', 'Prices across Northgate are moving', `The city price level is now ${((e.inflation - 1) * 100).toFixed(1)}% above the start of the game.`);
  }
  if (Math.abs(e.unemployment - data.lastUnemployment) >= 0.01) {
    addNews(state, 'PEOPLE', e.unemployment > data.lastUnemployment ? 'The labour market is weakening' : 'The labour market is tightening', `Unemployment is now ${(e.unemployment * 100).toFixed(1)}%. Hiring conditions are changing.`);
  }
  data.lastConfidence = e.confidence;
  data.lastInflation = e.inflation;
  data.lastInterest = e.interestRate;
  data.lastUnemployment = e.unemployment;
}

function businessPulse(state: GameState): void {
  for (const business of playerBusinesses(state)) {
    if (business.status !== 'open' || business.today.customers <= 0) continue;
    const building = buildingById(state, business.buildingId);
    const type = businessType(business.typeId);
    if (!building || !type) continue;
    const stockouts = business.today.lostCustomers;
    const score = clamp(
      1 + (business.serviceQuality / 100) * 2.8 + (business.reputation / 100) * 0.8 - Math.min(0.9, stockouts / Math.max(10, business.today.customers) * 2.5),
      1,
      5,
    );
    const rounded = Math.round(score * 10) / 10;
    business.reviewScore = clamp(business.reviewScore * 0.92 + rounded * 0.08, 1, 5);
    business.reviewCount += 1;
    business.reputation = clamp(business.reputation + (rounded - 3.2) * 0.8, 0, 100);
    addReview(state, business.id, rounded, reviewText(rounded, business.serviceQuality, stockouts));

    if (rounded <= 2.5) {
      pushAlert(state, 'warning', `${business.name} received a poor review`, 'Customer satisfaction is slipping. Check staffing, service quality and stock availability.', business.id);
    } else if (rounded >= 4.7) {
      addNews(state, 'COMPANY', `${business.name} is winning customers`, `A new ${rounded.toFixed(1)}★ review praises the business. Strong service is strengthening its reputation.`);
    }

    const d = district(building.district);
    if (business.today.customers > d.population * 0.002) {
      addNews(state, 'CITY', `${business.name} is becoming a local hotspot`, `${building.address} is drawing unusually strong traffic in ${d.name}.`);
    }
  }
}

function competitorPulse(state: GameState): void {
  const data = living(state);
  const count = state.businesses.filter((b) => b.companyId !== state.playerCompanyId && b.status === 'open').length;
  if (count !== data.lastCompetitorCount) {
    const delta = count - data.lastCompetitorCount;
    addNews(state, 'COMPETITION', delta > 0 ? 'Competition is expanding' : 'Competition is retreating', delta > 0
      ? `${delta} more rival outlet${delta === 1 ? '' : 's'} is now active in the city.`
      : `${Math.abs(delta)} rival outlet${Math.abs(delta) === 1 ? '' : 's'} has left the active market.`);
  }
  data.lastCompetitorCount = count;
}

export function settleLivingWorld(state: GameState): void {
  const data = living(state);
  if (!data.initialized) {
    data.initialized = true;
    addNews(state, 'CITY', 'A new trading day begins in Northgate', 'Markets are open. Watch demand, people and competitors before making your next move.');
  }
  maybeMarketNews(state);
  businessPulse(state);
  competitorPulse(state);

  const company = companyById(state, state.playerCompanyId);
  if (company && company.cash < 10000 && company.cash >= 0) {
    pushAlert(state, 'warning', 'Cash runway is getting tight', `Only €${Math.round(company.cash).toLocaleString('en-GB')} remains available. Protect liquidity before expanding.`, null);
  }
}
