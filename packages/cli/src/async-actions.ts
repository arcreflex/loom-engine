import type { GenerateOptions } from '@ankhdt/loom-engine';
import type { AppContext } from './App.tsx';
import { formatError } from './util.ts';

export const UNREAD_TAG = 'cli/unread';

export type AsyncAction = (ctx: AppContext) => Promise<void> | void;

export async function handleAsyncAction(
  appContext: AppContext,
  cb: AsyncAction
) {
  const { engine, dispatch } = appContext;
  dispatch({ type: 'SET_STATUS_LOADING' });
  try {
    await cb(appContext);
    dispatch({ type: 'SET_STATUS_IDLE' });
  } catch (err) {
    engine.log(err);
    dispatch({
      type: 'SET_STATUS_ERROR',
      payload: { error: formatError(err, appContext.debug) }
    });
  }
}

export async function userMessage(
  ctx: AppContext,
  args: {
    content: string;
    generateOptions: GenerateOptions;
  }
) {
  const {
    engine,
    state: { currentNodeId }
  } = ctx;
  const { content, generateOptions } = args;
  const userNode = await engine
    .getForest()
    .append(currentNodeId, [{ role: 'user', content }], {
      source_info: { type: 'user' }
    });
  await generate(
    { ...ctx, state: { ...ctx.state, currentNodeId: userNode.id } },
    generateOptions
  );
}

export async function navigateToSibling(
  { engine, dispatch, state: { currentNodeId } }: AppContext,
  args: { direction: 'left' | 'right' }
) {
  const { direction } = args;
  // Get current node
  const node = await engine.getForest().getNode(currentNodeId);
  if (!node || !node.parent_id) {
    return;
  }

  // Get parent node
  const parent = await engine.getForest().getNode(node.parent_id);
  if (!parent) {
    return;
  }

  // Get all siblings (children of the parent)
  const siblings = await engine.getForest().getChildren(parent.id);

  const currentIndex = siblings.findIndex(s => s.id === currentNodeId);
  const desiredIndex =
    direction === 'left' ? currentIndex - 1 : currentIndex + 1;
  if (desiredIndex < 0 || desiredIndex >= siblings.length) {
    return;
  }
  const newNode = siblings[desiredIndex];
  if (!newNode) {
    return;
  }
  dispatch({
    type: 'SET_CURRENT_NODE_ID',
    payload: { nodeId: newNode.id }
  });
}

export async function navigateToParent({
  engine,
  dispatch,
  state: { currentNodeId }
}: AppContext) {
  const node = await engine.getForest().getNode(currentNodeId);
  if (node && node.parent_id) {
    dispatch({
      type: 'SET_CURRENT_NODE_ID',
      payload: { nodeId: node.parent_id }
    });
  }
}

export async function save(
  { state: { currentNodeId }, configStore }: AppContext,
  args: { title: string }
) {
  const { title } = args;
  if (!title) {
    throw new Error(`Please provide a title for the bookmark.`);
  }

  if (configStore.get().bookmarks?.some(b => b.title === title)) {
    throw new Error(`Bookmark with title "${title}" already exists.`);
  }

  const now = new Date().toISOString();
  await configStore.update({
    bookmarks: [
      ...(configStore.get().bookmarks || []),
      {
        title,
        nodeId: currentNodeId,
        createdAt: now,
        updatedAt: now
      }
    ]
  });
}

async function generate(
  { engine, dispatch, state: { currentNodeId } }: AppContext,
  generateOptions: GenerateOptions
) {
  // Get current context
  const { root, messages } = await engine.getMessages(currentNodeId);

  // Generate responses
  const assistantNodes = await engine.generate(root, messages, generateOptions);

  if (assistantNodes.length === 1) {
    const chosenNode = assistantNodes[0];
    dispatch({
      type: 'SET_CURRENT_NODE_ID',
      payload: { nodeId: chosenNode.id }
    });
  } else {
    for (const node of assistantNodes) {
      await engine.getForest().updateNodeMetadata(node.id, {
        ...node.metadata,
        tags: [...new Set([...(node.metadata.tags || []), UNREAD_TAG])]
      });
    }

    // Since generate leaves us on the same node but adds children, force a fetch
    dispatch({ type: 'FORCE_FETCH' });
  }
}
