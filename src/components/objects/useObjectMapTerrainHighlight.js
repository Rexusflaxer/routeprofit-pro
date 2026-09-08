import { useEffect, useRef } from "react";
import { normalizeFeatureCollection } from "./objectMapGeometry";
import { terrainFeatureKey, terrainHighlightBounds } from "./objectMapTerrainHighlight";

const HOVER_DELAY_MS = 180;

export default function useObjectMapTerrainHighlight({ map, ready, terrain, highlightedTerrainKey, navigationBounds, dragging = false }) {
  const currentRef = useRef(null);
  currentRef.current = { terrain, navigationBounds };
  useEffect(() => {
    if (!map || !ready || !highlightedTerrainKey || dragging) return undefined;
    const alive = () => { try { return Boolean(map.getCanvasContainer?.()?.isConnected); } catch { return false; } };
    let ownMovement = false;
    let cancelled = false;
    const finish = () => { ownMovement = false; };
    const timer = setTimeout(() => {
      if (cancelled || !alive()) return;
      const current = currentRef.current;
      const matches = normalizeFeatureCollection(current.terrain).features.filter(feature => terrainFeatureKey(feature) === highlightedTerrainKey);
      if (matches.length !== 1) return;
      const bounds = terrainHighlightBounds(matches[0], current.navigationBounds);
      if (!bounds) return;
      try {
        const maxBounds = map.getMaxBounds?.();
        if (maxBounds?.contains && !bounds.every(coordinate => maxBounds.contains(coordinate))) return;
        const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        const camera = { padding: 56, maxZoom: Math.min(18.5, map.getMaxZoom?.() ?? 22), duration: reducedMotion ? 0 : 550, linear: true };
        const bearing = map.getBearing?.(), pitch = map.getPitch?.();
        if (Number.isFinite(bearing)) camera.bearing = bearing;
        if (Number.isFinite(pitch)) camera.pitch = pitch;
        map.stop?.();
        if (!alive()) return;
        ownMovement = true;
        map.once?.("moveend", finish);
        map.fitBounds(bounds, camera);
      } catch { ownMovement = false; /* Removed/reloading maps may reject a camera update. */ }
    }, HOVER_DELAY_MS);
    const cancel = () => { cancelled = true; ownMovement = false; clearTimeout(timer); };
    map.on?.("remove", cancel);
    return () => {
      clearTimeout(timer);
      map.off?.("remove", cancel);
      map.off?.("moveend", finish);
      if (ownMovement && alive()) map.stop?.();
    };
    // Geometry and undo updates refresh the target through the ref, but do not
    // restart a camera movement for a row that is already being pointed at.
  }, [map, ready, highlightedTerrainKey, dragging]);
}
