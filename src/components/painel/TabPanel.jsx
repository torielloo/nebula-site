import React from "react";
import { motion } from "framer-motion";

export default function TabPanel({ children }) {
  return (
    <motion.div
      className="min-w-0 overflow-x-clip"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}