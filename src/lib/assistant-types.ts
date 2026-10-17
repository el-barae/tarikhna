/** Public assistant payloads contain no provider configuration or credentials. */
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantSource {
  id: string;
  title: string;
  url?: string;
  locator?: string;
}

export interface AssistantReply {
  message: string;
  sources: AssistantSource[];
  /** Stable codes translated by the interface. */
  warnings?: string[];
}
