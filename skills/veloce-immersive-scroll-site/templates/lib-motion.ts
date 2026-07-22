import type { Variants } from "framer-motion";

/** Standard chapter-entry reveal. Respect prefers-reduced-motion by keeping distances small
 * and letting consumers pass `reduced` to collapse to an opacity-only transition. */
export function chapterVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.2 : 0.6, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

export function staggerContainer(reduced: boolean, stagger = 0.08): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduced ? 0 : stagger, delayChildren: 0.05 },
    },
  };
}

export const microInteraction = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
};
