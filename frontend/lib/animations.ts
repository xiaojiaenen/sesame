import type { Transition, Variants } from "motion/react";

/** Shared motion/react animation presets — 8px grid, 150-300ms timing */

const easeOut: Transition["ease"] = [0.22, 1, 0.36, 1];

export const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: easeOut },
};

export const fadeInLeft = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.2, ease: easeOut },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.2, ease: easeOut },
};

export const staggerDelay = (delay = 0.03) => ({
  transition: { delay },
});
