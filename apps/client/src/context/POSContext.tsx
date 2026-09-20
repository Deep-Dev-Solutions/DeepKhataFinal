"use client";

import React, { createContext, useContext, useState } from "react";

interface POSContextType {
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (value: boolean) => void;
}

const POSContext = createContext<POSContextType>({
  isCheckoutOpen: false,
  setIsCheckoutOpen: () => {},
});

export function POSProvider({ children }: { children: React.ReactNode }) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  return (
    <POSContext.Provider value={{ isCheckoutOpen, setIsCheckoutOpen }}>
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  return useContext(POSContext);
}