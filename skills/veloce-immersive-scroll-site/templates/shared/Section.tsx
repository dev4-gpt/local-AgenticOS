"use client";

import { motion, useReducedMotion } from "framer-motion";
import { chapterVariants } from "@/lib/motion";

export default function Section({
  id,
  className = "",
  children,
  eyebrow,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  eyebrow?: string;
}) {
  const reduced = !!useReducedMotion();

  return (
    <motion.section
      id={id}
      className={`relative mx-auto max-w-content px-6 py-24 md:py-32 ${className}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      variants={chapterVariants(reduced)}
    >
      {eyebrow && (
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-signal-500">
          {eyebrow}
        </p>
      )}
      {children}
    </motion.section>
  );
}
