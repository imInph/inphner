/**
 * inphner: Chart.js helpers. Chart.js is imported lazily (its own chunk), the
 * colours are read from the CSS custom properties AT DRAW TIME (so charts
 * follow theme + accent), and every chart is destroyed before its canvas is
 * drawn again (like inphub).
 */
import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

type ChartModule = typeof import('chart.js');
let chartJs: Promise<ChartModule> | null = null;

export function loadChartJs(): Promise<ChartModule> {
  chartJs ??= import('chart.js').then((m) => {
    m.Chart.register(
      m.LineController, m.BarController, m.ScatterController,
      m.LineElement, m.PointElement, m.BarElement,
      m.LinearScale, m.CategoryScale, m.Tooltip, m.Filler,
    );
    return m;
  });
  return chartJs;
}

/** The theme's colour tokens, read now. (Plain colours by design: see the token rule.) */
export function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    accent: v('--accent'), purple: v('--purple'), good: v('--good'), warn: v('--warn'), bad: v('--bad'),
    text: v('--text'), dim: v('--text-dim'), faint: v('--text-faint'), border: v('--border'),
    font: v('--font-rounded') || 'system-ui',
  };
}

/** A plain colour (#rgb / #rrggbb / rgb()) with an alpha, for fills. */
export function alpha(color: string, a: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1]!.split(/[ ,/]+/).map(Number);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
}

const live = new Map<HTMLCanvasElement, ChartType>();

/** Draw a chart on a canvas, destroying whatever was drawn there before. */
export async function draw(canvas: HTMLCanvasElement, config: ChartConfiguration): Promise<ChartType> {
  const { Chart } = await loadChartJs();
  live.get(canvas)?.destroy();
  const chart = new Chart(canvas, config);
  live.set(canvas, chart);
  return chart;
}

/** Destroy every chart under `root` (before its DOM is replaced). */
export function destroyWithin(root: HTMLElement): void {
  for (const [canvas, chart] of live) {
    if (!canvas.isConnected || root.contains(canvas)) {
      chart.destroy();
      live.delete(canvas);
    }
  }
}

/** Shared scale/tooltip styling in inphub's quiet manner. */
export function baseOptions(p: ReturnType<typeof palette>) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'nearest' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: alpha(p.text === '#10131a' ? '#ffffff' : '#12141c', 0.94),
        titleColor: p.text, bodyColor: p.dim, borderColor: p.border, borderWidth: 1,
        cornerRadius: 12, padding: 10, displayColors: true, boxPadding: 4,
        titleFont: { family: p.font, weight: 650 as const }, bodyFont: { family: p.font },
      },
    },
    scales: {
      x: { grid: { color: p.border, drawTicks: false }, border: { display: false }, ticks: { color: p.faint, font: { family: p.font, size: 11 }, padding: 6 } },
      y: { grid: { color: p.border, drawTicks: false }, border: { display: false }, ticks: { color: p.faint, font: { family: p.font, size: 11 }, padding: 6 } },
    },
  };
}
