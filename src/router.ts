/**
 * inphner: hash routing. `#timer`, `#sessions?focus=<id>`, `#trainer?set=pll`.
 * Routes carry params; views read them without consuming them (a view that
 * re-renders sees the same params), exactly like inphub.
 */

export interface Route {
  view: string;
  params: URLSearchParams;
}

export function parseRoute(hash = location.hash): Route {
  const [view = '', query = ''] = hash.replace(/^#/, '').split('?');
  return { view: decodeURIComponent(view), params: new URLSearchParams(query) };
}

export function routeKey(route: Route): string {
  const qs = route.params.toString();
  return route.view + (qs ? '?' + qs : '');
}

export function go(view: string, params?: Record<string, string | number>): void {
  const qs = params
    ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    : '';
  location.hash = view + (qs ? '?' + qs : '');
}
