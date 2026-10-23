/**
 * Smart Traffic Ambulance — Route Projection & Geodesic Engine
 * 
 * Handles great-circle Haversine distances, headings, perpendicular
 * projections of coordinates onto polyline segments, and cumulative
 * road distance measurements.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates great-circle distance between two geographic coordinates in metres.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates compass heading/bearing from point 1 to point 2 in degrees (0..360).
 */
export function calculateHeading(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Calculates total cumulative distance of a GeoJSON polyline in metres.
 * @param {Array<[number, number]>} polylineCoordinates Array of [longitude, latitude]
 */
export function getPolylineLength(polylineCoordinates) {
  if (!Array.isArray(polylineCoordinates) || polylineCoordinates.length < 2) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < polylineCoordinates.length - 1; i++) {
    const p1 = polylineCoordinates[i];
    const p2 = polylineCoordinates[i + 1];
    total += calculateHaversineDistance(p1[1], p1[0], p2[1], p2[0]);
  }
  return total;
}

/**
 * Projects a point (latitude, longitude) onto a road route polyline.
 * Computes:
 * 1. Perpendicular distance in metres between coordinate and closest point on polyline.
 * 2. Cumulative route distance in metres from route start to the projected point.
 * 3. Exact closest geographic coordinate on the road segment.
 * 
 * @param {number} latitude Point latitude
 * @param {number} longitude Point longitude
 * @param {Array<[number, number]>} polylineCoordinates GeoJSON array of [longitude, latitude]
 * @returns {{ distanceToRoute: number, routePosition: number, closestPoint: [number, number], segmentIndex: number } | null}
 */
export function projectPointOntoPolyline(latitude, longitude, polylineCoordinates) {
  if (!Array.isArray(polylineCoordinates) || polylineCoordinates.length < 2) {
    return null;
  }

  let minDistance = Number.POSITIVE_INFINITY;
  let bestRoutePosition = 0;
  let bestClosestPoint = [latitude, longitude];
  let bestSegmentIndex = 0;
  let cumulativeDistanceBeforeSegment = 0;

  // Local equirectangular scaling factors (metres per degree)
  const latRad = (latitude * Math.PI) / 180;
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos(latRad);

  for (let i = 0; i < polylineCoordinates.length - 1; i++) {
    // GeoJSON coordinate order: [longitude, latitude]
    const p1Lon = polylineCoordinates[i][0];
    const p1Lat = polylineCoordinates[i][1];
    const p2Lon = polylineCoordinates[i + 1][0];
    const p2Lat = polylineCoordinates[i + 1][1];

    const segLength = calculateHaversineDistance(p1Lat, p1Lon, p2Lat, p2Lon);

    // Vector from segment start (p1) to segment end (p2) in local metres
    const bx = (p2Lon - p1Lon) * metersPerLon;
    const by = (p2Lat - p1Lat) * metersPerLat;

    // Vector from segment start (p1) to query point in local metres
    const px = (longitude - p1Lon) * metersPerLon;
    const py = (latitude - p1Lat) * metersPerLat;

    const segLenSq = bx * bx + by * by;
    let t = 0;

    if (segLenSq > 0) {
      t = (px * bx + py * by) / segLenSq;
      t = Math.max(0, Math.min(1, t)); // Clamped projection scalar
    }

    // Projected point coordinates in local Cartesian offset
    const projX = t * bx;
    const projY = t * by;

    // Perpendicular Euclidean distance to line segment in metres
    const distanceToSegment = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

    if (distanceToSegment < minDistance) {
      minDistance = distanceToSegment;
      bestRoutePosition = cumulativeDistanceBeforeSegment + t * segLength;
      bestSegmentIndex = i;

      // Convert projected point back to geographic lat/lon
      const closestLat = p1Lat + t * (p2Lat - p1Lat);
      const closestLon = p1Lon + t * (p2Lon - p1Lon);
      bestClosestPoint = [closestLat, closestLon];
    }

    cumulativeDistanceBeforeSegment += segLength;
  }

  if (!Number.isFinite(minDistance)) {
    return null;
  }

  return {
    distanceToRoute: Math.round(minDistance * 10) / 10,
    routePosition: Math.round(bestRoutePosition * 10) / 10,
    closestPoint: bestClosestPoint,
    segmentIndex: bestSegmentIndex
  };
}

/**
 * Interpolates along a polyline given a normalized progress fraction [0..1].
 * Used for route simulation and continuous heading estimation.
 * 
 * @param {Array<[number, number]>} polylineCoordinates GeoJSON [longitude, latitude]
 * @param {number} progress Fraction from 0.0 to 1.0
 * @returns {{ point: [number, number], heading: number }} point as [latitude, longitude]
 */
export function interpolatePolyline(polylineCoordinates, progress) {
  if (!Array.isArray(polylineCoordinates) || polylineCoordinates.length === 0) {
    return { point: [0, 0], heading: 0 };
  }
  if (polylineCoordinates.length === 1 || progress <= 0) {
    return { point: [polylineCoordinates[0][1], polylineCoordinates[0][0]], heading: 0 };
  }
  if (progress >= 1) {
    const last = polylineCoordinates[polylineCoordinates.length - 1];
    return { point: [last[1], last[0]], heading: 0 };
  }

  const totalLength = getPolylineLength(polylineCoordinates);
  const targetDistance = progress * totalLength;

  let currentDist = 0;
  for (let i = 0; i < polylineCoordinates.length - 1; i++) {
    const p1 = polylineCoordinates[i];
    const p2 = polylineCoordinates[i + 1];
    const segLen = calculateHaversineDistance(p1[1], p1[0], p2[1], p2[0]);

    if (currentDist + segLen >= targetDistance) {
      const segT = segLen > 0 ? (targetDistance - currentDist) / segLen : 0;
      const lat = p1[1] + segT * (p2[1] - p1[1]);
      const lon = p1[0] + segT * (p2[0] - p1[0]);
      const heading = calculateHeading(p1[1], p1[0], p2[1], p2[0]);
      return { point: [lat, lon], heading };
    }
    currentDist += segLen;
  }

  const end = polylineCoordinates[polylineCoordinates.length - 1];
  return { point: [end[1], end[0]], heading: 0 };
}
