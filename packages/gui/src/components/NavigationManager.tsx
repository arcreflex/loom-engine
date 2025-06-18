import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../state';

export function NavigationManager() {
  const navigate = useNavigate();
  const { nodeId: currentNodeId } = useParams<{ nodeId: string }>();
  const { pendingNavigation, actions } = useAppStore(state => ({
    pendingNavigation: state.pendingNavigation,
    actions: state.actions
  }));

  useEffect(() => {
    if (pendingNavigation && pendingNavigation !== currentNodeId) {
      // Perform the navigation
      navigate(`/nodes/${encodeURIComponent(pendingNavigation)}`);
      // Clear the pending navigation
      actions.clearPendingNavigation();
    }
  }, [pendingNavigation, currentNodeId, navigate, actions]);

  return null; // This component doesn't render anything
}
