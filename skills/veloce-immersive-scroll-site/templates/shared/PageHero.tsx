"use client";

import { motion, useReducedMotion } from "framer-motion";
import { chapterVariants, staggerContainer } from "@/lib/motion";

export default function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const reduced = !!useReducedMotion();

  return (
    <section className="relative flex min-h-[70vh] items-center px-6 pt-24">
      <motion.div
        className="mx-auto max-w-content"
        initial="hidden"
        animate="visible"
        variants={staggerContainer(reduced)}
      >
        <motion.p
          variants={chapterVariants(reduced)}
          className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-signal-500"
        >
          {eyebrow}
        </motion.p>
        <motion.h1
          variants={chapterVariants(reduced)}
          className="max-w-2xl font-display text-4xl leading-tight text-mist-200 md:text-5xl"
        >
          {title}
        </motion.h1>
        <motion.p variants={chapterVariants(reduced)} className="mt-6 max-w-xl text-lg text-mist-300">
          {description}
        </motion.p>
      </motion.div>
    </section>
  );
}
