import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { VaaniStateAnnotation } from './state.js';
import { agentNode, toolExecutorNode, routeAfterAgent } from './nodes.js';

/**
 * In-memory checkpointer keyed by `thread_id` for multi-turn conversational continuity.
 */
export const vaaniCheckpointer = new MemorySaver();

/**
 * LangGraph Tool-Calling Agent Workflow:
 * START -> agent -> (if tool_calls) -> tools -> agent -> END
 */
const workflow = new StateGraph(VaaniStateAnnotation)
  .addNode('agent', agentNode)
  .addNode('tools', toolExecutorNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent, {
    tools: 'tools',
    __end__: END
  })
  .addEdge('tools', 'agent');

export const vaaniGraph = workflow.compile({
  checkpointer: vaaniCheckpointer
});
