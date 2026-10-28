/**
 * Smart Traffic Ambulance — Priority Decision Engine
 * 
 * Enforces Sections 10 & 11:
 * - Exactly one junction can hold PRIORITY_ACTIVE at any given moment.
 * - Activates only when approaching the NEXT junction within 8m along the road.
 * - Manages state transitions: NOT_ON_ROUTE, WAITING, NEXT, PRIORITY_ACTIVE, PASSED, NORMAL.
 * - Releases priority and switches to NEXT junction when vehicle moves 8m past current junction.
 * - Tracks command versions and timestamps to prevent stale command execution.
 */

import { JUNCTIONS, THRESHOLDS } from "./config.js";

export class PriorityManager {
  constructor() {
    this.activePriorityJunctionId = null;
    this.nextJunctionId = null;
    this.commandVersion = 0;
  }

  reset() {
    this.activePriorityJunctionId = null;
    this.nextJunctionId = null;
    this.commandVersion += 1;
    return this.generateResetPayload();
  }

  /**
   * Evaluates priority state based on route progress and next junction distance.
   * 
   * @param {object | null} nextJunction Next unpassed junction object
   * @param {number} distanceAlongRoute Distance in metres to next junction along road
   * @param {Array<object>} routeJunctions All junctions belonging to route
   * @param {Set<string>} passedJunctionIds Set of passed junction IDs
   * @param {boolean} isGpsReliable
   * @returns {{
   *   activeJunctionId: string | null,
   *   nextJunctionId: string | null,
   *   status: string,
   *   states: Record<string, { status: string, timestamp: number }>,
   *   version: number,
   *   timestamp: number
   * }}
   */
  evaluatePriority(nextJunction, distanceAlongRoute, routeJunctions, passedJunctionIds, isGpsReliable = true) {
    this.commandVersion += 1;

    // Fail-safe: If GPS is unreliable or no route exists, return safe NORMAL state
    if (!isGpsReliable || !nextJunction) {
      this.activePriorityJunctionId = null;
      this.nextJunctionId = null;
      return this.generateStatePayload(null, null, routeJunctions, passedJunctionIds, "NORMAL");
    }

    this.nextJunctionId = nextJunction.id;

    // If previously active junction is marked PASSED, release priority immediately
    if (this.activePriorityJunctionId && passedJunctionIds && passedJunctionIds.has(this.activePriorityJunctionId)) {
      this.activePriorityJunctionId = null;
    }

    // Priority condition: Emergency signal opens when approaching within 25m of next junction along road
    if (distanceAlongRoute <= THRESHOLDS.PRIORITY_DISTANCE && distanceAlongRoute >= -THRESHOLDS.JUNCTION_PASSED_ROUTE_BUFFER) {
      this.activePriorityJunctionId = nextJunction.id;
    } else {
      // Vehicle is outside 25m trigger zone
      this.activePriorityJunctionId = null;
    }

    const overallStatus = this.activePriorityJunctionId
      ? `PRIORITY ACTIVE — ${this.activePriorityJunctionId}`
      : `NEXT — ${this.nextJunctionId}`;

    return this.generateStatePayload(
      this.activePriorityJunctionId,
      this.nextJunctionId,
      routeJunctions,
      passedJunctionIds,
      overallStatus
    );
  }

  /**
   * Generates complete state mapping for all fixed junctions (J1..J4).
   */
  generateStatePayload(activeId, nextId, routeJunctions, passedJunctionIds, statusText) {
    const states = {};
    const now = Date.now();

    for (const junction of JUNCTIONS) {
      const isOnRoute = routeJunctions.some((rj) => rj.id === junction.id);
      let junctionStatus = "NOT_ON_ROUTE";

      // Passed junctions ALWAYS take highest precedence to ensure green priority shuts off
      if (passedJunctionIds && passedJunctionIds.has(junction.id)) {
        junctionStatus = "PASSED";
      } else if (junction.id === activeId) {
        junctionStatus = "PRIORITY_ACTIVE";
      } else if (junction.id === nextId) {
        junctionStatus = "NEXT";
      } else if (isOnRoute) {
        junctionStatus = "WAITING";
      }

      states[junction.id] = {
        status: junctionStatus,
        timestamp: now
      };
    }

    return {
      activeJunctionId: activeId,
      nextJunctionId: nextId,
      status: statusText,
      states,
      version: this.commandVersion,
      timestamp: now
    };
  }

  /**
   * Generates clean reset state setting all junctions to NORMAL.
   */
  generateResetPayload() {
    const states = {};
    const now = Date.now();

    for (const junction of JUNCTIONS) {
      states[junction.id] = {
        status: "NORMAL",
        timestamp: now
      };
    }

    return {
      activeJunctionId: null,
      nextJunctionId: null,
      status: "NORMAL",
      states,
      version: this.commandVersion,
      timestamp: now
    };
  }

  getActivePriorityJunctionId() {
    return this.activePriorityJunctionId;
  }

  getNextJunctionId() {
    return this.nextJunctionId;
  }
}
