/**
 * Unit Tests for route-projection.js
 */

import { calculateHaversineDistance, projectPointOntoPolyline, getPolylineLength } from "../js/route-projection.js";

export function runRouteProjectionTests(assert) {
  assert.suite("Route Projection & Geodesic Math");

  // Test 1: Haversine distance between two known points
  const d = calculateHaversineDistance(11.018563, 76.934374, 11.019186, 76.934437);
  assert.isTrue(d > 60 && d < 80, `Expected distance between J1 and J2 ~69m, got ${Math.round(d)}m`);

  // Test 2: Distance to identical point is zero
  const dZero = calculateHaversineDistance(11.020, 76.933, 11.020, 76.933);
  assert.equal(Math.round(dZero), 0, "Distance to self should be 0");

  // Test 3: Project point onto straight north-south line segment
  const line = [
    [76.934000, 11.010000], // [lon, lat]
    [76.934000, 11.020000]
  ];

  // Point exactly on the line
  const onLineProj = projectPointOntoPolyline(11.015000, 76.934000, line);
  assert.isTrue(onLineProj !== null, "Projection should return valid object");
  assert.isTrue(onLineProj.distanceToRoute < 1.0, `Perpendicular distance should be ~0m, got ${onLineProj.distanceToRoute}m`);
  assert.isTrue(onLineProj.routePosition > 500 && onLineProj.routePosition < 600, `Midpoint route position expected ~556m, got ${onLineProj.routePosition}m`);

  // Point 20m east of line
  const offsetProj = projectPointOntoPolyline(11.015000, 76.934183, line);
  assert.isTrue(offsetProj.distanceToRoute > 15 && offsetProj.distanceToRoute < 25, `Expected perpendicular distance ~20m, got ${offsetProj.distanceToRoute}m`);

  // Test 4: Polyline total length
  const totalLen = getPolylineLength(line);
  assert.isTrue(totalLen > 1100 && totalLen < 1125, `Expected polyline length ~1113m, got ${Math.round(totalLen)}m`);
}
