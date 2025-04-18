import React, {
  createContext,
  useReducer,
  type ReactNode,
  type Dispatch
} from 'react';
import type { GuiAppState, GuiAppAction } from './types';
import { initialState } from './state';
import { guiAppReducer } from './reducer';

// Define the shape of the context value
interface AppContextValue {
  state: GuiAppState;
  dispatch: Dispatch<GuiAppAction>;
}

// Create the context with a default value (or undefined/null and check in consumer)
const AppContext = createContext<AppContextValue | undefined>(undefined);

// Create a provider component
interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(guiAppReducer, initialState);

  const contextValue: AppContextValue = {
    state,
    dispatch
  };

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

// Create context hook in separate file to fix React Fast Refresh warning
export { AppContext };
