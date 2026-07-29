import { createContext, useContext, useState, ReactNode } from 'react';

export type CopilotContextData = {
  taskId?: string;
  emailId?: string;
};

export type CopilotContextType = {
  isCopilotOpen: boolean;
  setIsCopilotOpen: (open: boolean) => void;
  copilotContext: CopilotContextData | null;
  setCopilotContext: (context: CopilotContextData | null) => void;
  openCopilotWithContext: (context: CopilotContextData) => void;
};

export const CopilotContext = createContext<CopilotContextType | null>(null);

export const useCopilot = () => {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error('useCopilot must be used within a CopilotProvider');
  }
  return context;
};

export const CopilotProvider = ({ children }: { children: ReactNode }) => {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotContext, setCopilotContext] = useState<CopilotContextData | null>(null);

  const openCopilotWithContext = (context: CopilotContextData) => {
    setCopilotContext(context);
    setIsCopilotOpen(true);
  };

  return (
    <CopilotContext.Provider 
      value={{ 
        isCopilotOpen, 
        setIsCopilotOpen, 
        copilotContext, 
        setCopilotContext, 
        openCopilotWithContext 
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
};
