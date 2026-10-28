/**
 * Unit Tests for priority-manager.js
 */

import { PriorityManager } from "../js/priority-manager.js";

export function runPriorityManagerTests(assert) {
  assert.suite("Priority Decision State Machine");

  const pManager = new PriorityManager();

  const mockRouteJunctions = [
    { id: "J3", name: "Junction 3", routePosition: 100 },
    { id: "J1", name: "Junction 1", routePosition: 240 },
    { id: "J2", name: "Junction 2", routePosition: 350 }
  ];

  const passedSet = new Set();

  // Test 1: Approaching J3 from 50m away (outside 25m priority range)
  const res1 = pManager.evaluatePriority(mockRouteJunctions[0], 50, mockRouteJunctions, passedSet, true);
  assert.equal(res1.activeJunctionId, null, "Active junction should be null when > 25m away");
  assert.equal(res1.nextJunctionId, "J3", "Next junction should be J3");
  assert.equal(res1.states.J3.status, "NEXT", "J3 status should be NEXT when approaching > 25m");
  assert.equal(res1.states.J1.status, "WAITING", "J1 status should be WAITING");

  // Test 2: Ambulance closes in to 15m from J3 (inside 25m priority trigger range)
  const res2 = pManager.evaluatePriority(mockRouteJunctions[0], 15, mockRouteJunctions, passedSet, true);
  assert.equal(res2.activeJunctionId, "J3", "Active junction MUST be J3 within 25m");
  assert.equal(res2.states.J3.status, "PRIORITY_ACTIVE", "J3 status MUST be PRIORITY_ACTIVE (Emergency signal open)");
  assert.equal(res2.states.J1.status, "WAITING", "Only 1 junction can be active. J1 must remain WAITING");

  // Test 3: J3 is passed (+8m beyond), next junction is J1 (140m away)
  passedSet.add("J3");
  const res3 = pManager.evaluatePriority(mockRouteJunctions[1], 140, mockRouteJunctions, passedSet, true);
  assert.equal(res3.activeJunctionId, null, "Active junction should clear after J3 is passed (+8m buffer)");
  assert.equal(res3.nextJunctionId, "J1", "Next junction should advance to J1");
  assert.equal(res3.states.J3.status, "PASSED", "J3 status must be PASSED (Signal released)");
  assert.equal(res3.states.J1.status, "NEXT", "J1 status must be NEXT");

  // Test 4: Unreliable GPS triggers safe NORMAL fallback
  const res4 = pManager.evaluatePriority(mockRouteJunctions[1], 50, mockRouteJunctions, passedSet, false);
  assert.equal(res4.activeJunctionId, null, "Active junction must immediately clear if GPS becomes unreliable");
  assert.equal(res4.status, "NORMAL", "Status must return to NORMAL when tracking is lost");
}
