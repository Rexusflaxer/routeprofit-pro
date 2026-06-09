import { motion } from "framer-motion";
import { useNavigationDirection } from "@/lib/navigationDirection";

/**
 * Wrap any page's root element with this component for consistent slide animations.
 * - Navigating "forward" (deeper): slides in from right
 * - Navigating "back": slides in from left
 */
export default function PageTransition({ children, className = "space-y-6" }) {
  const direction = useNavigationDirection();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: direction === "back" ? -32 : 32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}