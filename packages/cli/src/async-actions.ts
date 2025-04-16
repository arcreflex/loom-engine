import type { GenerateOptions, NodeId, Role } from '@ankhdt/loom-engine';
import type { AppContext } from './App.tsx';
import { formatError } from './util.ts';
import { parseModelString } from './parse-model-string.ts';

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

export async function addMessage(
  ctx: AppContext,
  args: {
    role: Role;
    content: string;
    generateOptions: GenerateOptions;
    sendRequest: boolean;
  }
) {
  const {
    engine,
    state: { currentNodeId }
  } = ctx;
  const { role, content } = args;
  const userNode = await engine
    .getForest()
    .append(currentNodeId, [{ role, content }], {
      source_info: { type: 'user' }
    });
  ctx.dispatch({
    type: 'SET_CURRENT_NODE_ID',
    payload: { nodeId: userNode.id }
  });
  if (args.sendRequest) {
    await generate(
      { ...ctx, state: { ...ctx.state, currentNodeId: userNode.id } },
      args.generateOptions
    );
  }
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

export async function generate(
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

export async function deleteNodes(
  { engine, configStore, dispatch, state: { currentNodeId } }: AppContext,
  nodeIds: NodeId[]
) {
  let nextSibling: NodeId | undefined;
  let nextParent: NodeId | undefined;
  for (const nodeId of nodeIds) {
    const node = await engine.getForest().getNode(nodeId);
    const parent =
      node?.parent_id && (await engine.getForest().getNode(node.parent_id));
    nextParent = node?.parent_id;
    const siblings = parent?.child_ids || [];
    const currentIndex = siblings.findIndex(s => s === nodeId);
    if (currentIndex >= 0 && currentIndex < siblings.length - 1) {
      nextSibling = siblings[currentIndex + 1];
    }

    await engine.getForest().deleteNode(nodeId, false);

    const bookmarks = configStore.get().bookmarks || [];
    if (bookmarks.some(b => b.nodeId === nodeId)) {
      await configStore.update({
        bookmarks: bookmarks.filter(b => b.nodeId !== nodeId)
      });
    }
    await engine.getForest().deleteNode(nodeId, false);
  }

  if (!nextParent) {
    throw new Error(`Programming error: deleted node without a parent`);
  }

  const currentNodeExists = !!(await engine.getForest().getNode(currentNodeId));
  if (!currentNodeExists) {
    dispatch({
      type: 'SET_CURRENT_NODE_ID',
      payload: { nodeId: nextSibling || nextParent }
    });
  } else {
    dispatch({ type: 'FORCE_FETCH' });
  }
}

export async function switchModel(
  { engine, dispatch }: AppContext,
  args: { model: string; system: string | undefined }
) {
  const { model, provider } = parseModelString(args.model);

  const rootConfig = {
    provider,
    model,
    systemPrompt: args.system
  };

  const targetRoot = await engine.getForest().getOrCreateRoot(rootConfig);
  dispatch({ type: 'SET_CURRENT_NODE_ID', payload: { nodeId: targetRoot.id } });
}
