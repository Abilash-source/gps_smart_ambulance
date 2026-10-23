/**
 * Unit Tests for junction-manager.js
 */

import { JunctionManager } from "../js/junction-manager.js";

export function runJunctionOrderTests(assert) {
  assert.suite("Junction Corridor Matching & Ordering");

  const jManager = new JunctionManager();

  // Mock road polyline passing close to J3 (11.017374), then J1 (11.018563), then J2 (11.019186)
  const mockRouteCoords = [
    [76.934500, 11.016500], // Start: south of J3
    [76.934500, 11.017500], // Near J3
    [76.934400, 11.018600], // Near J1
    [76.934400, 11.019500], // Near J2
    [76.933400, 11.020600]  // Ending at Demo Hospital A
  ];

  // Test 1: Route analysis should detect on-route junctions
  const matched = jManager.analyzeRouteJunctions(mockRouteCoords);
  assert.isTrue(matched.length >= 3, `Expected at least 3 junctions detected, got ${matched.length}`);

  // Test 2: Sequence MUST be J3 -> J1 -> J2 (not alphabetical or coordinate array order)
  const sequenceIds = matched.map((j) => j.id);
  assert.equal(sequenceIds[0], "J3", "First junction on this route must be J3");
  assert.equal(sequenceIds[1], "J1", "Second junction on this route must be J1");
  assert.equal(sequenceIds[2], "J2", "Third junction on this route must be J2");

  // Test 3: Monotonic progress and Next Junction evaluation
  // Place ambulance before J3
  const step1 = jManager.evaluateAmbulanceProgress(11.016800, 76.934500, mockRouteCoords);
  assert.equal(step1.nextJunction?.id, "J3", "Next junction before passing J3 should be J3");

  // Advance ambulance 15m beyond J3
  const j3RoutePos = matched.find((j) => j.id === "J3").routePosition;
  const step2 = jManager.evaluateAmbulanceProgress(11.018000, 76.934450, mockRouteCoords);
  assert.isTrue(jManager.isJunctionPassed("J3"), "J3 must be marked PASSED after moving beyond it +8m buffer");
  assert.equal(step2.nextJunction?.id, "J1", "Next junction must advance to J1 after J3 is passed");

  // Minor backward GPS noise should NOT reverse passed junction status
  const noisyBackwardStep = jManager.evaluateAmbulanceProgress(11.016800, 76.934500, mockRouteCoords);
  assert.isTrue(jManager.isJunctionPassed("J3"), "J3 must remain PASSED even if GPS noise jumps backwards");
}
