/** Small inline SVG charts. No dependency, sharp at any DPI, theme-aware. */

const NS = 'http://www.w3.org/2000/svg';

function svg(width: number, height: number): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('class', 'chart');
  return el;
}

function node(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/**
 * A line chart with a zero baseline. Values above zero are drawn green, below
 * red, because in this game the sign is the whole story.
 */
export function lineChart(values: number[], options: { height?: number; showZero?: boolean } = {}): SVGSVGElement {
  const width = 600;
  const height = options.height ?? 130;
  const el = svg(width, height);
  if (values.length === 0) {
    el.appendChild(
      node('text', { x: String(width / 2), y: String(height / 2), fill: '#64758a', 'font-size': '13', 'text-anchor': 'middle' }),
    ).textContent = 'No data yet';
    return el;
  }

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 6;
  const usable = height - pad * 2;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const toY = (value: number): number => pad + (1 - (value - min) / span) * usable;

  if (options.showZero !== false && min < 0 && max > 0) {
    el.appendChild(
      node('line', {
        x1: '0', x2: String(width),
        y1: String(toY(0)), y2: String(toY(0)),
        stroke: '#33465f', 'stroke-width': '1', 'stroke-dasharray': '4 4',
      }),
    );
  }

  const points = values.map((value, index) => `${(index * stepX).toFixed(1)},${toY(value).toFixed(1)}`);
  const last = values[values.length - 1];
  const stroke = last >= 0 ? '#4bbf87' : '#e2686d';

  el.appendChild(
    node('polyline', {
      points: `0,${toY(min)} ${points.join(' ')} ${width},${toY(min)}`,
      fill: last >= 0 ? 'rgba(75,191,135,0.13)' : 'rgba(226,104,109,0.13)',
      stroke: 'none',
    }),
  );
  el.appendChild(
    node('polyline', {
      points: points.join(' '),
      fill: 'none',
      stroke,
      'stroke-width': '2',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke',
    }),
  );
  return el;
}

/** Horizontal comparison bars, used for share-of-market and cost breakdowns. */
export function barChart(rows: { label: string; value: number; tone?: string }[]): HTMLElement {
  const host = document.createElement('div');
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  for (const row of rows) {
    const wrap = document.createElement('div');
    wrap.style.margin = '7px 0';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px';
    const label = document.createElement('span');
    label.className = 'muted';
    label.textContent = row.label;
    const value = document.createElement('span');
    value.style.fontVariantNumeric = 'tabular-nums';
    value.textContent = row.tone === 'raw' ? String(row.value) : '';
    head.append(label, value);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = `bar-fill ${row.tone && row.tone !== 'raw' ? row.tone : ''}`;
    fill.style.width = `${((Math.abs(row.value) / max) * 100).toFixed(1)}%`;
    bar.appendChild(fill);
    wrap.append(head, bar);
    host.appendChild(wrap);
  }
  return host;
}
