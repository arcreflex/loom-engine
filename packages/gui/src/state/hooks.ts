import { useContext } from 'react';
import { AppContext } from './context';

// Create a custom hook for consuming the context easily
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
