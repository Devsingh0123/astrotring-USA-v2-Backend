import { Annotation, messagesStateReducer } from '@langchain/langgraph';

/**
 * LangGraph State Schema for Jyotish & Shastra.
 * Keeps `chartData` and `birthParams` in state for on-demand tool execution
 * without dumping the entire chart into the system prompt.
 */
export const JyotishStateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  }),
  engine: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 'jyotish'
  }),
  userName: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 'Seeker'
  }),
  userSummary: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => ''
  }),
  chartData: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => null
  }),
  birthParams: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => null
  }),
  latestReading: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => null
  }),
  tokensUsed: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 0
  })
});
