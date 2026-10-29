// Run from frontend with: node scripts/check-rack-map.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { IsometricRackMap } = await server.ssrLoadModule('/src/components/rack-map/IsometricRackMap.tsx');
  const racks = Array.from({ length: 12 }, (_, i) => ({
    rackId: `R-${String(i + 1).padStart(2, '0')}`, status: 'HEALTHY',
    worstUtilizationPct: 50, powerLoadKw: 5, maxPowerKw: 10, incidentCount: 0,
  }));
  const render = (items) => renderToStaticMarkup(React.createElement(IsometricRackMap, {
    racks: items, cooling: [], selected: 'R-01', onSelect() {}, zoom: 1,
  }));
  const markup = render(racks);
  assert.equal(render([...racks].reverse()), markup, 'API ordering must not change rack placement or occlusion');
  const positions = [...markup.matchAll(/transform="translate\(([-\d.]+) ([-\d.]+)\)" class="rack /g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  assert.equal(positions.length, 12);
  assert.equal(new Set(positions.map(String)).size, 12, 'rack positions must be unique');
  assert.ok(positions.every((p, i) => i === 0 || p[1] >= positions[i - 1][1]), 'near racks must paint last');
  const floor = [[70, 292], [405, 99], [864, 365], [530, 558]];
  for (const [x, y] of positions) {
    for (const [dx, dy] of [[-7, 4], [38, 30], [77, 7], [32, -19]]) {
      const sides = floor.map(([ax, ay], i) => {
        const [bx, by] = floor[(i + 1) % floor.length];
        return (bx - ax) * (y + dy - ay) - (by - ay) * (x + dx - ax);
      });
      assert.ok(sides.every(v => v >= 0) || sides.every(v => v <= 0), 'rack footprint must stay on the raised floor');
    }
  }
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  console.log('PASS rack ordering, floor containment, unique placement, and selection');
} finally {
  await server.close();
}
