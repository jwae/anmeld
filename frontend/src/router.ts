import { reactive } from "vue";

export const APP_PATHS = {
  home: "/",
  anmVerfahren: "/anm/verfahren",
  anmVerfahrensdaten: "/anm/verfahrensdaten",
  anmAbgleich: "/anm/abgleich",
  anmKoordination: "/anm/koordination",
} as const;

const validPaths = new Set<string>(Object.values(APP_PATHS));

function normalizePath(path: string): string {
  const trimmedPath = String(path || "").trim() || APP_PATHS.home;
  if (trimmedPath === "/anm") {
    return APP_PATHS.anmVerfahren;
  }
  return validPaths.has(trimmedPath) ? trimmedPath : APP_PATHS.home;
}

export const routeState = reactive({
  path: normalizePath(typeof window !== "undefined" ? window.location.pathname : APP_PATHS.home),
});

function commitPath(path: string, replace = false) {
  const nextPath = normalizePath(path);
  if (typeof window === "undefined") {
    routeState.path = nextPath;
    return nextPath;
  }

  const currentPath = window.location.pathname;
  if (currentPath !== nextPath) {
    if (replace) {
      window.history.replaceState({}, "", nextPath);
    } else {
      window.history.pushState({}, "", nextPath);
    }
  } else if (replace) {
    window.history.replaceState({}, "", nextPath);
  }

  routeState.path = nextPath;
  return nextPath;
}

export function navigateTo(path: string) {
  return commitPath(path, false);
}

export function replaceRoute(path: string) {
  return commitPath(path, true);
}

export function isAnmRoutePath(path: string) {
  return path.startsWith("/anm/");
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const normalizedPath = normalizePath(window.location.pathname);
    routeState.path = normalizedPath;
    if (window.location.pathname !== normalizedPath) {
      window.history.replaceState({}, "", normalizedPath);
    }
  });

  if (window.location.pathname !== routeState.path) {
    window.history.replaceState({}, "", routeState.path);
  }
}
