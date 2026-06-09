import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Simple depth map: higher number = deeper in the hierarchy.
 * Pages not listed default to depth 0.
 */
const PAGE_DEPTHS = {
  "/": 0,
  "/Dashboard": 0,
  "/Companies": 1,
  "/CompanyDetail": 2,
  "/Personnel": 1,
  "/Customers": 1,
  "/Objects": 1,
  "/Routes": 1,
  "/RouteExecutions": 1,
  "/RouteExecutionDetails": 2,
  "/Uitvoering": 1,
  "/Vehicles": 1,
  "/ReportTemplates": 1,
  "/Settings": 1,
  "/CostSettings": 1,
  "/EmployeePortal": 1,
};

function getDepth(pathname) {
  return PAGE_DEPTHS[pathname] ?? 0;
}

// Module-level store so it persists across renders without context
let _direction = "forward";
let _prevPathname = null;

export function useNavigationDirection() {
  const location = useLocation();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      _prevPathname = location.pathname;
      return;
    }
    if (_prevPathname === location.pathname) return;
    const prev = getDepth(_prevPathname || "/");
    const next = getDepth(location.pathname);
    _direction = next < prev ? "back" : "forward";
    _prevPathname = location.pathname;
  }, [location.pathname]);

  return _direction;
}