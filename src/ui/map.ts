import type { GameState } from '../sim/state';
import { businessById } from '../sim/state';
import type { Building, DistrictDef } from '../sim/types';
import { DISTRICTS } from '../data/districts';
import { businessType } from '../data/businessTypes';
import { attractiveness, backgroundOutlets, typeShare } from '../sim/demand';
import { clamp } from '../sim/util';

/**
 * The city map.
 *
 * Everything is drawn in code at the device's real pixel density, so it stays
 * sharp at any zoom level on any screen. The layout never changes; the overlays
 * are what turn it into an analysis tool.
 */

export type MapMode = 'standard' | 'commercial' | 'demand' | 'income' | 'competition' | 'property' | 'traffic';

export const MAP_MODES: { id: MapMode; label: string; legend: string }[] = [
  { id: 'standard', label: 'Standard', legend: 'Districts and available units' },
  { id: 'commercial', label: 'Commercial', legend: 'Units suitable for business' },
  { id: 'demand', label: 'Demand', legend: 'Customer demand per district' },
  { id: 'income', label: 'Income', legend: 'Average household income' },
  { id: 'competition', label: 'Competition', legend: 'Competitor density' },
  { id: 'property', label: 'Property', legend: 'Price per square metre' },
  { id: 'traffic', label: 'Traffic', legend: 'Foot traffic at each address' },
];

const CITY_W = 1;
const CITY_H = 0.92;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 14;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Pointer {
  id: number;
  x: number;
  y: number;
}

/** Blue → amber → red ramp used by every data overlay. */
function heat(value: number): string {
  const t = clamp(value, 0, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgb(${Math.round(58 + k * 92)}, ${Math.round(110 + k * 60)}, ${Math.round(180 - k * 40)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${Math.round(150 + k * 90)}, ${Math.round(170 - k * 90)}, ${Math.round(140 - k * 90)})`;
}

export class CityMap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState;
  private camera: Camera;
  private mode: MapMode = 'standard';
  private pointers: Pointer[] = [];
  private dragged = false;
  private pinchStart = 0;
  private pinchZoom = 1;
  private hoverId: string | null = null;
  private selectedId: string | null = null;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private frame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  onSelect: (building: Building | null) => void = () => {};

  constructor(state: GameState, camera: Camera) {
    this.state = state;
    this.camera = camera;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = context;
    this.attach();
  }

  setMode(mode: MapMode): void {
    this.mode = mode;
    this.draw();
  }

  getMode(): MapMode {
    return this.mode;
  }

  setState(state: GameState): void {
    this.state = state;
    this.draw();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.draw();
  }

  /** Centres the view on a building without changing zoom. */
  focus(building: Building, zoom = 4): void {
    this.camera.x = building.x + building.w / 2;
    this.camera.y = building.y + building.h / 2;
    this.camera.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.draw();
  }

  zoomBy(factor: number): void {
    this.camera.zoom = clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.clampCamera();
    this.draw();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    // The canvas keeps a 16:10 shape so the city is never squashed.
    const width = Math.max(240, rect.width);
    const height = clamp(width * 0.62, 260, 720);
    this.cssW = width;
    this.cssH = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.draw();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------- projection

  private scale(): number {
    return Math.min(this.cssW / CITY_W, this.cssH / CITY_H) * this.camera.zoom;
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const s = this.scale();
    return {
      x: (x - this.camera.x) * s + this.cssW / 2,
      y: (y - this.camera.y) * s + this.cssH / 2,
    };
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    const s = this.scale();
    return {
      x: (px - this.cssW / 2) / s + this.camera.x,
      y: (py - this.cssH / 2) / s + this.camera.y,
    };
  }

  private clampCamera(): void {
    // Allow a small margin so edge districts can be centred.
    const s = this.scale();
    const halfW = this.cssW / 2 / s;
    const halfH = this.cssH / 2 / s;
    const margin = 0.06;
    const minX = Math.min(halfW - margin, CITY_W / 2);
    const maxX = Math.max(CITY_W - halfW + margin, CITY_W / 2);
    const minY = Math.min(halfH - margin, CITY_H / 2);
    const maxY = Math.max(CITY_H - halfH + margin, CITY_H / 2);
    this.camera.x = clamp(this.camera.x, minX, maxX);
    this.camera.y = clamp(this.camera.y, minY, maxY);
  }

  // ------------------------------------------------------------- input

  private attach(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.pointers.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
      this.dragged = false;
      if (this.pointers.length === 2) {
        this.pinchStart = this.pointerDistance();
        this.pinchZoom = this.camera.zoom;
      }
      canvas.classList.add('dragging');
    });

    canvas.addEventListener('pointermove', (event) => {
      const index = this.pointers.findIndex((p) => p.id === event.pointerId);
      if (index === -1) {
        this.updateHover(event);
        return;
      }
      const previous = this.pointers[index];
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      this.pointers[index] = { id: event.pointerId, x: event.clientX, y: event.clientY };

      if (this.pointers.length === 2 && this.pinchStart > 0) {
        const distance = this.pointerDistance();
        this.camera.zoom = clamp((distance / this.pinchStart) * this.pinchZoom, MIN_ZOOM, MAX_ZOOM);
        this.dragged = true;
        this.clampCamera();
        this.draw();
        return;
      }

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragged = true;
      const s = this.scale();
      this.camera.x -= dx / s;
      this.camera.y -= dy / s;
      this.clampCamera();
      this.draw();
    });

    const release = (event: PointerEvent): void => {
      const wasSingle = this.pointers.length === 1;
      this.pointers = this.pointers.filter((p) => p.id !== event.pointerId);
      if (this.pointers.length < 2) this.pinchStart = 0;
      if (this.pointers.length === 0) canvas.classList.remove('dragging');
      if (wasSingle && !this.dragged) this.handleTap(event);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const before = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
        this.camera.zoom = clamp(this.camera.zoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16), MIN_ZOOM, MAX_ZOOM);
        const after = this.toWorld(event.clientX - rect.left, event.clientY - rect.top);
        // Keep the point under the cursor fixed while zooming.
        this.camera.x += before.x - after.x;
        this.camera.y += before.y - after.y;
        this.clampCamera();
        this.draw();
      },
      { passive: false },
    );

    canvas.addEventListener('pointerleave', () => {
      this.hoverId = null;
      this.draw();
    });

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    } else {
      globalThis.addEventListener('resize', () => this.resize());
    }
  }

  private pointerDistance(): number {
    if (this.pointers.length < 2) return 0;
    return Math.hypot(this.pointers[0].x - this.pointers[1].x, this.pointers[0].y - this.pointers[1].y);
  }

  private updateHover(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const found = this.pick(event.clientX - rect.left, event.clientY - rect.top);
    const id = found?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.draw();
    }
  }

  private handleTap(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const found = this.pick(event.clientX - rect.left, event.clientY - rect.top);
    this.selectedId = found?.id ?? null;
    this.onSelect(found);
    this.draw();
  }

  /** Finds the building under a screen point, with a touch-friendly margin. */
  private pick(px: number, py: number): Building | null {
    const world = this.toWorld(px, py);
    const s = this.scale();
    // At least a 22px target, so small units stay tappable on a phone.
    const pad = Math.max(0, (11 - 0) / s);
    let best: Building | null = null;
    let bestDistance = Infinity;
    for (const building of this.state.buildings) {
      const inside =
        world.x >= building.x - pad &&
        world.x <= building.x + building.w + pad &&
        world.y >= building.y - pad &&
        world.y <= building.y + building.h + pad;
      if (!inside) continue;
      const cx = building.x + building.w / 2;
      const cy = building.y + building.h / 2;
      const distance = (world.x - cx) ** 2 + (world.y - cy) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ drawing

  draw(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  private paint(): void {
    if (this.cssW === 0) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // Water and land.
    ctx.fillStyle = '#0c1723';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const s = this.scale();
    const showDetail = s > 900;
    const showLabels = s > 520;

    for (const def of DISTRICTS) {
      this.paintDistrict(def, showLabels);
    }
    for (const building of this.state.buildings) {
      this.paintBuilding(building, showDetail);
    }
    if (showLabels) {
      for (const def of DISTRICTS) this.paintDistrictLabel(def);
    }
  }

  private districtValue(def: DistrictDef): number {
    const districtState = this.state.districts[def.id];
    switch (this.mode) {
      case 'demand': {
        const index = districtState?.demandIndex ?? 1;
        return clamp((def.footTraffic / 42000) * 0.5 + (def.population / 130000) * 0.5 * index, 0, 1);
      }
      case 'income':
        return clamp((def.averageIncome - 20000) / 125000, 0, 1);
      case 'property':
        return clamp((def.pricePerSqm * (districtState?.propertyIndex ?? 1)) / 6500, 0, 1);
      case 'traffic':
        return clamp(def.footTraffic / 42000, 0, 1);
      case 'competition': {
        const buildings = this.state.buildings.filter((b) => b.district === def.id);
        const rivals = buildings.filter((b) => b.status === 'competitor').length;
        return clamp(rivals / Math.max(1, buildings.length * 0.55), 0, 1);
      }
      case 'commercial':
        return clamp(def.commercialActivity / 1.9, 0, 1);
      default:
        return -1;
    }
  }

  private paintDistrict(def: DistrictDef, showLabels: boolean): void {
    const ctx = this.ctx;
    const topLeft = this.toScreen(def.x, def.y);
    const s = this.scale();
    const w = def.w * s;
    const h = def.h * s;
    if (topLeft.x + w < -40 || topLeft.x > this.cssW + 40) return;
    if (topLeft.y + h < -40 || topLeft.y > this.cssH + 40) return;

    const value = this.districtValue(def);
    ctx.fillStyle = value >= 0 ? heat(value) : '#16202d';
    ctx.globalAlpha = value >= 0 ? 0.5 : 1;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = value >= 0 ? 'rgba(255,255,255,0.18)' : '#243141';
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, w - 1, h - 1);

    if (!showLabels && w > 46) {
      ctx.fillStyle = 'rgba(230,237,245,0.55)';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(def.short, topLeft.x + w / 2, topLeft.y + h / 2 + 3);
    }
  }

  private paintDistrictLabel(def: DistrictDef): void {
    const ctx = this.ctx;
    const topLeft = this.toScreen(def.x, def.y);
    const s = this.scale();
    const w = def.w * s;
    if (topLeft.x + w < 0 || topLeft.x > this.cssW) return;
    ctx.fillStyle = 'rgba(230,237,245,0.85)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(def.name, topLeft.x + 6, topLeft.y + 14);
  }

  private buildingColour(building: Building): string {
    const player = this.state.playerCompanyId;
    if (building.occupantCompanyId === player) return '#4bbf87';
    if (building.status === 'competitor') return '#e2686d';

    switch (this.mode) {
      case 'traffic':
        return heat(clamp(building.footTraffic / 42000, 0, 1));
      case 'property':
        return heat(clamp(building.value / 900000, 0, 1));
      case 'commercial':
        return building.status === 'available' ? '#6f9bd0' : '#3b4a5d';
      default:
        return building.status === 'available' ? '#55677e' : '#3b4a5d';
    }
  }

  private paintBuilding(building: Building, showDetail: boolean): void {
    const ctx = this.ctx;
    const topLeft = this.toScreen(building.x, building.y);
    const s = this.scale();
    const w = Math.max(2, building.w * s);
    const h = Math.max(2, building.h * s);
    if (topLeft.x + w < 0 || topLeft.x > this.cssW || topLeft.y + h < 0 || topLeft.y > this.cssH) return;

    ctx.fillStyle = this.buildingColour(building);
    ctx.fillRect(topLeft.x, topLeft.y, w, h);

    const selected = building.id === this.selectedId;
    const hovered = building.id === this.hoverId;
    if (selected || hovered) {
      ctx.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = selected ? 2 : 1.5;
      ctx.strokeRect(topLeft.x - 1, topLeft.y - 1, w + 2, h + 2);
    }

    if (!showDetail || w < 26 || h < 14) return;

    // Close in, show what is actually in the unit.
    const business = building.businessId ? businessById(this.state, building.businessId) : undefined;
    if (business) {
      const type = businessType(business.typeId);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(topLeft.x, topLeft.y, w, h);
      ctx.fillStyle = '#e6edf5';
      ctx.font = `${Math.min(13, h * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(type?.icon ?? '•', topLeft.x + w / 2, topLeft.y + h / 2 + 4);
      if (h > 30 && w > 60) {
        ctx.fillStyle = 'rgba(230,237,245,0.85)';
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.fillText(this.truncate(business.name, w), topLeft.x + w / 2, topLeft.y + h - 5);
      }
    } else if (h > 24 && w > 54) {
      ctx.fillStyle = 'rgba(230,237,245,0.7)';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.truncate(building.address, w), topLeft.x + w / 2, topLeft.y + h / 2 + 3);
    }
  }

  private truncate(text: string, width: number): string {
    const max = Math.max(3, Math.floor(width / 5.6));
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }
}

/** Market share of a business inside its district and category, 0..1. */
export function marketShare(state: GameState, businessId: string): number {
  const business = state.businesses.find((b) => b.id === businessId);
  if (!business) return 0;
  const building = state.buildings.find((b) => b.id === business.buildingId);
  if (!building) return 0;
  const category = businessType(business.typeId)?.category;
  const peers = state.businesses.filter((other) => {
    if (other.status !== 'open' || other.id === business.id) return false;
    if (other.typeId !== business.typeId) return false;
    const otherBuilding = state.buildings.find((b) => b.id === other.buildingId);
    return otherBuilding?.district === building.district;
  });
  const own = attractiveness(state, business).score;
  const simulated = peers.reduce((acc, peer) => acc + attractiveness(state, peer).score, 0);
  const background = category ? backgroundOutlets(building.district, category, 0) * typeShare(business.typeId) : 0;
  const total = own + simulated + background;
  return total > 0 ? own / total : 0;
}
