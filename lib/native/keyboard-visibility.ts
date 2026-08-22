"use client";

import { Keyboard } from "@capacitor/keyboard";
import { useEffect } from "react";
import { isIOSApp } from "@/lib/native/platform";

export const NATIVE_KEYBOARD_INPUT_MARGIN = 12;

export function getNativeKeyboardSafeBottom({
  innerHeight,
  keyboardHeight,
  visualViewportHeight,
  visualViewportOffsetTop = 0,
  margin = NATIVE_KEYBOARD_INPUT_MARGIN,
}: {
  innerHeight: number;
  keyboardHeight: number;
  visualViewportHeight?: number | null;
  visualViewportOffsetTop?: number;
  margin?: number;
}) {
  const visualViewportIsReduced =
    visualViewportHeight != null && visualViewportHeight < innerHeight - 1;
  const keyboardTop = visualViewportIsReduced
    ? visualViewportOffsetTop + visualViewportHeight
    : innerHeight - keyboardHeight;

  return Math.max(0, keyboardTop - margin);
}

export function getNativeKeyboardVisibilityAdjustment({
  inputTop,
  inputBottom,
  visibleTop,
  visibleBottom,
}: {
  inputTop: number;
  inputBottom: number;
  visibleTop: number;
  visibleBottom: number;
}) {
  if (visibleBottom <= visibleTop) return 0;
  if (inputBottom > visibleBottom) return inputBottom - visibleBottom;
  if (inputTop < visibleTop) return inputTop - visibleTop;
  return 0;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    target.matches('input, textarea, select, [contenteditable="true"]')
  );
}

function canOwnVerticalScroll(element: HTMLElement) {
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

export function findNativeKeyboardScrollOwner(input: HTMLElement) {
  for (let element = input.parentElement; element; element = element.parentElement) {
    if (element.hasAttribute("data-active-workout-scroll-owner")) return null;
    if (
      element.hasAttribute("data-keyboard-scroll-owner") ||
      canOwnVerticalScroll(element)
    ) {
      return element;
    }
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

type KeyboardSpacer = {
  node: HTMLDivElement;
  owner: HTMLElement;
  height: number;
  removeOnScroll?: () => void;
};

function removeSpacer(spacer: KeyboardSpacer | null) {
  if (!spacer) return;
  spacer.removeOnScroll?.();
  spacer.node.remove();
}

function createSpacer(owner: HTMLElement, height: number): KeyboardSpacer {
  const node = document.createElement("div");
  node.dataset.nativeKeyboardSpacer = "true";
  node.setAttribute("aria-hidden", "true");
  Object.assign(node.style, {
    display: "block",
    flex: `0 0 ${height}px`,
    gridColumn: "1 / -1",
    height: `${height}px`,
    minHeight: `${height}px`,
    pointerEvents: "none",
    width: "1px",
  });
  const host = owner === document.scrollingElement ? document.body : owner;
  host.appendChild(node);
  return { node, owner, height };
}

/**
 * Keeps ordinary native-iOS forms keyboard-safe without taking ownership away
 * from the active workout. The nearest actual overflow surface scrolls; page
 * forms fall back to the document's normal scrolling element.
 */
export function useNativeKeyboardVisibility() {
  useEffect(() => {
    if (!isIOSApp()) return;

    let focusedInput: HTMLElement | null = null;
    let keyboardHeight = 0;
    let keyboardVisible = false;
    let frame: number | null = null;
    let spacer: KeyboardSpacer | null = null;
    let disposed = false;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    const cancelFrame = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };

    const ensureVisible = () => {
      frame = null;
      const input = focusedInput;
      if (!input?.isConnected || !keyboardVisible) return;
      const owner = findNativeKeyboardScrollOwner(input);
      if (!owner) return;

      const inputRect = input.getBoundingClientRect();
      const ownerRect = owner.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const safeBottom = getNativeKeyboardSafeBottom({
        innerHeight: window.innerHeight,
        keyboardHeight,
        visualViewportHeight: visualViewport?.height,
        visualViewportOffsetTop: visualViewport?.offsetTop ?? 0,
      });
      const adjustment = getNativeKeyboardVisibilityAdjustment({
        inputTop: inputRect.top,
        inputBottom: inputRect.bottom,
        visibleTop: Math.max(0, ownerRect.top) + NATIVE_KEYBOARD_INPUT_MARGIN,
        visibleBottom: Math.min(ownerRect.bottom, safeBottom),
      });
      if (Math.abs(adjustment) <= 1) return;

      const maxScrollTop = Math.max(0, owner.scrollHeight - owner.clientHeight);
      const requestedTop = owner.scrollTop + adjustment;
      const missingRange = Math.max(0, requestedTop - maxScrollTop);
      if (missingRange > 1) {
        removeSpacer(spacer);
        spacer = createSpacer(owner, Math.ceil(missingRange));
        // Measure only after the temporary range exists. The next frame still
        // performs a single scroll, before any value/input event is needed.
        frame = window.requestAnimationFrame(ensureVisible);
        return;
      }

      owner.scrollTo({
        top: Math.min(maxScrollTop, Math.max(0, requestedTop)),
        behavior: "smooth",
      });
    };

    const scheduleEnsureVisible = () => {
      cancelFrame();
      frame = window.requestAnimationFrame(ensureVisible);
    };

    const removeSpacerWhenStable = () => {
      const current = spacer;
      if (!current?.node.isConnected) {
        spacer = null;
        return;
      }
      const maxWithoutSpacer = Math.max(
        0,
        current.owner.scrollHeight - current.height - current.owner.clientHeight
      );
      if (current.owner.scrollTop <= maxWithoutSpacer + 1) {
        removeSpacer(current);
        spacer = null;
        return;
      }

      const handleScroll = () => {
        if (current.owner.scrollTop > maxWithoutSpacer + 1) return;
        current.owner.removeEventListener("scroll", handleScroll);
        removeSpacer(current);
        if (spacer === current) spacer = null;
      };
      current.owner.addEventListener("scroll", handleScroll, { passive: true });
      current.removeOnScroll = () =>
        current.owner.removeEventListener("scroll", handleScroll);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;
      if (event.target.closest("[data-active-workout-scroll-owner]")) return;
      focusedInput = event.target;
      if (keyboardVisible) scheduleEnsureVisible();
    };

    document.addEventListener("focusin", handleFocusIn);
    void Keyboard.addListener("keyboardDidShow", (detail) => {
      keyboardVisible = true;
      keyboardHeight = detail.keyboardHeight;
      scheduleEnsureVisible();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    });
    void Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisible = false;
      keyboardHeight = 0;
      focusedInput = null;
      cancelFrame();
      removeSpacerWhenStable();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    });

    return () => {
      disposed = true;
      cancelFrame();
      document.removeEventListener("focusin", handleFocusIn);
      removeSpacer(spacer);
      spacer = null;
      for (const listener of listeners) void listener.remove();
    };
  }, []);
}
