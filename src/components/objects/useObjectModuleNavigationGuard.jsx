import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const GUARD_STATE_KEY = "__loqObjectModuleGuard";

function currentRelativeUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isPlainNavigationClick(event) {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

/**
 * BrowserRouter exposes no transaction blocker. This guard therefore combines
 * explicit in-app navigation requests with a same-URL history sentinel. The
 * sentinel keeps the workspace mounted while browser Back is being confirmed.
 */
export function useObjectModuleNavigationGuard({
  dirty,
  moduleName,
  onSave,
  saving = false,
  onRegisterNavigationGuard,
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  const pendingActionRef = useRef(null);
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(onSave);
  const guardIdRef = useRef(`module-${Math.random().toString(36).slice(2)}`);
  const sentinelPresentRef = useRef(false);
  const bypassPopRef = useRef(false);
  const allowUnloadRef = useRef(false);

  dirtyRef.current = dirty;
  saveRef.current = onSave;

  const pushSentinel = useCallback(() => {
    if (!dirtyRef.current || typeof window === "undefined") return;
    const guardId = guardIdRef.current;
    const currentState = window.history.state || {};
    if (currentState[GUARD_STATE_KEY] === guardId) {
      sentinelPresentRef.current = true;
      return;
    }
    const currentIndex = Number.isInteger(currentState.idx) ? currentState.idx : 0;
    window.history.pushState(
      { ...currentState, idx: currentIndex + 1, [GUARD_STATE_KEY]: guardId },
      "",
      currentRelativeUrl(),
    );
    sentinelPresentRef.current = true;
  }, []);

  const releaseSentinelThen = useCallback((action, restoreSentinel = false) => {
    const finish = () => {
      action?.();
      if (restoreSentinel && dirtyRef.current) queueMicrotask(pushSentinel);
    };
    const currentState = window.history.state || {};
    if (!sentinelPresentRef.current || currentState[GUARD_STATE_KEY] !== guardIdRef.current) {
      sentinelPresentRef.current = false;
      finish();
      return;
    }
    sentinelPresentRef.current = false;
    bypassPopRef.current = true;
    window.addEventListener("popstate", () => {
      bypassPopRef.current = false;
      finish();
    }, { once: true });
    window.history.back();
  }, [pushSentinel]);

  const requestNavigation = useCallback((action, options = {}) => {
    if (typeof action !== "function") return;
    if (!dirtyRef.current) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setPending({
      kind: options.kind || "leave",
      destinationLabel: options.destinationLabel || null,
      sentinelReleased: Boolean(options.sentinelReleased),
    });
  }, []);

  const navigateWithinWorkspace = useCallback(action => {
    if (typeof action !== "function") return;
    if (!dirtyRef.current) {
      action();
      return;
    }
    releaseSentinelThen(action, true);
  }, [releaseSentinelThen]);

  const runPending = useCallback((saved) => {
    if (!pending) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setPending(null);
    if (saved) dirtyRef.current = false;
    if (pending.sentinelReleased) {
      action?.();
      return;
    }
    const remainsInWorkspace = pending.kind === "workspace-tab";
    releaseSentinelThen(action, remainsInWorkspace && !saved);
  }, [pending, releaseSentinelThen]);

  const cancelPending = useCallback(() => {
    if (pending?.sentinelReleased) pushSentinel();
    pendingActionRef.current = null;
    setPending(null);
  }, [pending, pushSentinel]);

  const saveAndContinue = useCallback(async () => {
    try {
      await saveRef.current?.();
      runPending(true);
    } catch {
      // The mutation owns the error toast. Keep the dialog open so the user
      // can correct or retry without losing the local configuration.
    }
  }, [runPending]);

  useEffect(() => {
    if (dirty) pushSentinel();
    else if (sentinelPresentRef.current) releaseSentinelThen(null, false);
  }, [dirty, pushSentinel, releaseSentinelThen]);

  useEffect(() => {
    if (typeof onRegisterNavigationGuard !== "function") return undefined;
    return onRegisterNavigationGuard((action, options = {}) => requestNavigation(action, {
      ...options,
      kind: options.kind || "leave",
    }));
  }, [onRegisterNavigationGuard, requestNavigation]);

  useEffect(() => {
    const handleBeforeUnload = event => {
      if (!dirtyRef.current || allowUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (bypassPopRef.current || !dirtyRef.current || !sentinelPresentRef.current) return;
      sentinelPresentRef.current = false;
      const continueBack = () => {
        bypassPopRef.current = true;
        window.addEventListener("popstate", () => { bypassPopRef.current = false; }, { once: true });
        window.history.back();
      };
      requestNavigation(continueBack, { kind: "browser-back", sentinelReleased: true });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [requestNavigation]);

  useEffect(() => {
    const handleDocumentClick = event => {
      if (!dirtyRef.current || !isPlainNavigationClick(event)) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      requestNavigation(() => {
        if (destination.origin === window.location.origin) {
          navigate(`${destination.pathname}${destination.search}${destination.hash}`);
          return;
        }
        allowUnloadRef.current = true;
        window.location.assign(destination.href);
      }, { kind: "route", destinationLabel: anchor.textContent?.trim() || null });
    };
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [navigate, requestNavigation]);

  const workspaceSwitch = pending?.kind === "workspace-tab";
  const destinationText = pending?.destinationLabel ? ` naar ${pending.destinationLabel}` : "";
  const dialog = (
    <AlertDialog open={Boolean(pending)} onOpenChange={open => { if (!open && !saving) cancelPending(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/60 bg-amber-500/10">
            <TriangleAlert className="h-5 w-5 text-amber-600" />
          </div>
          <AlertDialogTitle>Wijzigingen nog niet opgeslagen</AlertDialogTitle>
          <AlertDialogDescription>
            {workspaceSwitch
              ? `U heeft lokale wijzigingen in ${moduleName}. Sla het concept op voordat u van onderdeel wisselt, of open het onderdeel met behoud van de lokale wijzigingen.`
              : `U heeft lokale wijzigingen in ${moduleName}. Als u doorgaat${destinationText} zonder op te slaan, gaan deze wijzigingen verloren.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          <AlertDialogCancel disabled={saving}>Blijven</AlertDialogCancel>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={saving} onClick={() => runPending(false)}>
              {workspaceSwitch ? "Onderdeel openen" : "Zonder opslaan doorgaan"}
            </Button>
            <Button type="button" disabled={saving} onClick={saveAndContinue}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Opslaan en doorgaan
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestNavigation, navigateWithinWorkspace, dialog };
}
