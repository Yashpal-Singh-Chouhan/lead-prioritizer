"use client";
// Remembers whether the user has moved between pages inside the app in this tab, so our Back
// buttons can use the browser's own history (router.back) and only fall back to a fixed page
// when the app was opened directly on this URL (nothing to go back to).
import { useEffect } from "react";
import { usePathname } from "next/navigation";

let lastPath: string | null = null;
let movedInsideApp = false;

export function useTrackPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) movedInsideApp = true;
    lastPath = pathname;
  }, [pathname]);
}

export function hasInAppHistory() {
  return movedInsideApp;
}
