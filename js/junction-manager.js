/**
 * Smart Traffic Ambulance — Route-Aware Junction Manager
 * 
 * Enforces Sections 9 & 10:
 * - Projects fixed junctions onto the actual OSRM road geometry.
 * - Filters junctions within 50m of the driving route corridor.
 * - Sorts junctions sequentially along the route.
 * - Tracks ambulance route progress monotonically without backward jumps.
 * - Marks junctions as PASSED when advancing beyond route position + 8m buffer.
 * - Maintains passed-junction memory across route recalculations.
 */

import { JUNCTIONS, THRESHOLDS } from "./config.js";
import { projectPointOntoPolyline } from "./route-projection.js";

export class JunctionManager {
  constructor() {
    this.routeJunctions = [];          // Ordered junctions lying along current route
    this.passedJunctionIds = new Set(); // Persistent memory of passed junctions
    this.lastAmbulanceRoutePosition = 0;
  }

  /**
   * Clears all route-specific progress and memory.
   */
  reset() {
    this.routeJunctions = [];
    this.passedJunctionIds.clear();
    this.lastAmbulanceRoutePosition = 0;
  }

  /**
   * Identifies and orders fixed junctions along a newly calculated road route polyline.
   * 
   * @param {Array<[number, number]>} routeCoordinates GeoJSON [longitude, latitude]
   * @returns {Array<{ id: string, name: string, latitude: number, longitude: number, distanceToRoute: number, routePosition: number }>}
   */
  analyzeRouteJunctions(routeCoordinates) {
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
      this.routeJunctions = [];
      return [];
    }

    const matched = [];

    for (const junction of JUNCTIONS) {
      const proj = projectPointOntoPolyline(junction.latitude, junction.longitude, routeCoordinates);

      // Rule: Keep only fixed junctions within 50 metres of the actual road route
      if (proj && proj.distanceToRoute <= THRESHOLDS.JUNCTION_ROUTE_RADIUS) {
        matched.push({
          ...junction,
          distanceToRoute: proj.distanceToRoute,
          routePosition: proj.routePosition
        });
      }
    }

    // Sort sequentially from ambulance origin (0m) toward destination hospital
    matched.sort((a, b) => a.routePosition - b.routePosition);
    this.routeJunctions = matched;

    return this.routeJunctions;
  }

  /**
   * Updates ambulance progress and evaluates passed junctions and next junction.
   * 
   * @param {number} ambulanceLat
   * @param {number} ambulanceLon
   * @param {Array<[number, number]>} routeCoordinates
   * @returns {{
   *   currentRoutePosition: number,
   *   nextJunction: object | null,
   *   distanceAlongRoute: number,
   *   justPassedJunctions: string[],
   *   remainingJunctions: object[]
   * }}
   */
  evaluateAmbulanceProgress(ambulanceLat, ambulanceLon, routeCoordinates) {
    if (this.routeJunctions.length === 0 || !Array.isArray(routeCoordinates)) {
      return {
        currentRoutePosition: 0,
        nextJunction: null,
        distanceAlongRoute: Infinity,
        justPassedJunctions: [],
        remainingJunctions: []
      };
    }

    const proj = projectPointOntoPolyline(ambulanceLat, ambulanceLon, routeCoordinates);
    let currentRoutePosition = 0;

    if (proj) {
      // Advance route progress monotonically (prevent minor GPS jitter from reversing route progress)
      currentRoutePosition = Math.max(this.lastAmbulanceRoutePosition, proj.routePosition);
      this.lastAmbulanceRoutePosition = currentRoutePosition;
    } else {
      currentRoutePosition = this.lastAmbulanceRoutePosition;
    }

    const justPassedJunctions = [];

    // Check passed junctions: ambulance advanced >= 8m beyond junction route position
    for (const j of this.routeJunctions) {
      if (
        !this.passedJunctionIds.has(j.id) &&
        currentRoutePosition >= j.routePosition + THRESHOLDS.JUNCTION_PASSED_ROUTE_BUFFER
      ) {
        this.passedJunctionIds.add(j.id);
        justPassedJunctions.push(j.id);
      }
    }

    // Remaining unpassed junctions on the route
    const remainingJunctions = this.routeJunctions.filter((j) => !this.passedJunctionIds.has(j.id));
    const nextJunction = remainingJunctions.length > 0 ? remainingJunctions[0] : null;

    let distanceAlongRoute = Infinity;
    if (nextJunction) {
      // Distance measured along the actual road driving route
      distanceAlongRoute = Math.max(0, nextJunction.routePosition - currentRoutePosition);
    }

    return {
      currentRoutePosition,
      nextJunction,
      distanceAlongRoute,
      justPassedJunctions,
      remainingJunctions
    };
  }

  /**
   * Reconciles passed junctions when a route recalculation occurs.
   * Preserves already passed junctions so an automatic recalculation does not reactivate them.
   */
  reconcilePassedJunctionsWithNewRoute(newRouteJunctions, currentProgress) {
    this.routeJunctions = newRouteJunctions;
    for (const j of newRouteJunctions) {
      if (currentProgress >= j.routePosition + THRESHOLDS.JUNCTION_PASSED_ROUTE_BUFFER) {
        this.passedJunctionIds.add(j.id);
      }
    }
  }

  isJunctionPassed(junctionId) {
    return this.passedJunctionIds.has(junctionId);
  }

  getOrderedRouteJunctions() {
    return [...this.routeJunctions];
  }

  getPassedJunctionIds() {
    return new Set(this.passedJunctionIds);
  }
}
