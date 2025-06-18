import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../state';

export function NavigationManager() {
  const navigate = useNavigate();
  const { nodeId: currentNodeId } = useParams<{ nodeId: string }>();

  const pendingNavigation = useAppStore(state => state.pendingNavigation);

  const clearPendingNavigation = useAppStore(
    state => state.actions.clearPendingNavigation
  );

  useEffect(() => {
    if (pendingNavigation && pendingNavigation !== currentNodeId) {
      // Perform the navigation
      navigate(`/nodes/${encodeURIComponent(pendingNavigation)}`);
      // Clear the pending navigation
      clearPendingNavigation();
    }
  }, [pendingNavigation, currentNodeId, navigate, clearPendingNavigation]);

  return null; // This component doesn't render anything
}
