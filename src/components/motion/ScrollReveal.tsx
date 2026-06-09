import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * ScrollReveal — fades and rises content into view as it enters the viewport.
 * Uses Framer Motion's whileInView + IntersectionObserver under the hood.
 * Premium easing, runs once. Mobile-friendly (reduced distance).
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article" | "header";
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}

/**
 * StaggerChildren — wrap a container with this and use <StaggerItem> inside
 * to get staggered fade-up entry as the container scrolls into view.
 */
const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function StaggerChildren({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/**
 * TypewriterLoop — Dancing Script gold typewriter that writes letters one by
 * one, pauses, fades out, repeats forever. Replaces .script-typer for hero.
 */
export function TypewriterLoop({
  text = "Good Payroll Starts Here",
  className = "",
}: { text?: string; className?: string }) {
  return (
    <span
      className={`script-typer ${className}`}
      style={{ "--text-len": `${text.length}ch` } as React.CSSProperties}
      aria-label={text}
    >
      {text}
    </span>
  );
}
